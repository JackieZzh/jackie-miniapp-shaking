const path = require('path');
const fse = require('fs-extra');
const htmlparser2 = require('htmlparser2');
const { getReplaceComponent, getGenericName } = require('./utils');
const { MainDepend } = require('./MainDepend');
const { SubDepend } = require('./SubDepend');
const { ConfigService } = require('./ConfigService');
const { asyncService } = require('./AsyncService');

class DependContainer {

  constructor(options) {
    this.config = new ConfigService(options);
  }

  async init() {
    this.clear();
    this.initMainDepend();
    this.initSubDepend();
    this.handleAsyncFile();
    this.splitIsolatedNpmForSubPackage();
    const allFiles = await this.copyAllFiles();
    this.deleteGroupCode();
    this.replaceComponentsPath(allFiles);
    if (this.config.isSplitNpm) {
      this.moveIsolatedNpm();
      this.replacePath();
    }
    if (this.config.analyseDir) {
      this.createTree();
    }
    console.log('success!');
  }

  clear() {
    fse.removeSync(this.config.targetDir);
  }

  initMainDepend() {
    console.log('正在生成主包依赖...');
    this.mainDepend = new MainDepend(this.config, '');
    this.mainDepend.run();
  }

  initSubDepend() {
    console.log('正在生成子包依赖...');
    const { subPackages, subpackages } = fse.readJsonSync(path.join(this.config.sourceDir, 'app.json'));
    const subPkgs = subPackages || subpackages;
    const subDepends = [];
    if (subPkgs && subPkgs.length) {
      subPkgs.forEach(item => {
        if (this.config.needDeleteSubPackages && this.config.needDeleteSubPackages.includes(item.root)) {
          console.log("已删除分包代码: ", item.root);
        } else {
          const subPackageDepend = new SubDepend(this.config, item.root, this.mainDepend);
          item.pages.forEach(page => {
            subPackageDepend.addPage(page);
          });
          subDepends.push(subPackageDepend);
        }
      });
    }
    this.subDepends = subDepends;
  }

  handleAsyncFile() {
    let fileObj = '';
    const allDepends = [this.mainDepend].concat(this.subDepends);
    while (fileObj = asyncService.getNextFile()) {
      let { key, file } = fileObj;
      if (key === this.config.mainPackageName) {
        key = '';
      }
      const depend = allDepends.find(depend => depend.rootDir === key);
      if (depend) {
        depend.addToTree(file, false);
      }
    }
    asyncService.clear();
  }

  splitIsolatedNpmForSubPackage() {
    const mainNpm = this.mainDepend.npms;
    const subDepends = this.subDepends;
    const interDependNpms = new Set();
    subDepends.forEach(item => {
      let otherNpm = subDepends.reduce((sum, it) => {
        if (it !== item) {
          this.appendSet(sum, it.npms);
        }
        return sum;
      }, new Set());
      Array.from(item.npms).forEach(npm => {
        if (otherNpm.has(npm) || this.config.excludeNpms.includes(npm)) {
          interDependNpms.add(npm);
        } else if (!mainNpm.has(npm)) {
          item.isolatedNpms.add(npm);
        }
      });
    });
    console.log('mainNpm', Array.from(this.appendSet(mainNpm, interDependNpms)));
    subDepends.forEach(item => {
      console.log(`${item.rootDir}_npm`, Array.from(item.isolatedNpms));
    });
  }

  appendSet(set1, set2) {
    for (let item of set2.values()) {
      if (!set1.has(item)) {
        set1.add(item);
      }
    }
    return set1;
  }

  createTree() {
    console.log('正在生成依赖图...');
    const tree = { [this.config.mainPackageName]: this.mainDepend.tree };
    this.subDepends.forEach(item => {
      tree[item.rootDir] = item.tree;
    });
    fse.copySync(path.join(__dirname, '../analyse'), this.config.analyseDir);
    fse.writeJSONSync(path.join(this.config.analyseDir, 'tree.json'), tree, { spaces: 2 });
  }

  replacePath() {
    console.log('正在修复路径映射...');
    this.subDepends.forEach(sub => {
      sub.replaceNpmDependPath();
      sub.replaceNormalFileDependPath();
    });
  }

  moveIsolatedNpm() {
    console.log('正在移动独立npm包...');
    this.subDepends.forEach(sub => {
      Array.from(sub.isolatedNpms).forEach(npm => {
        const source = path.join(this.config.targetDir, `miniprogram_npm/${npm}`);
        const target = path.join(this.config.targetDir, `${sub.rootDir}/${sub.rootDir}_npm/${npm}`);
        fse.moveSync(source, target);
      });
    });
  }

  async copyAllFiles() {
    let allFiles = this.getAllStaticFiles();
    console.log('正在拷贝文件....');
    const allDepends = [this.mainDepend].concat(this.subDepends);
    allDepends.forEach(item => {
      allFiles.push(...Array.from(item.files));
    });
    allFiles = Array.from(new Set(allFiles));
    // 过滤pages页面
    if (this.config.needDeletePages) {
      allFiles = this.isDelPages(allFiles)
    }
    await this._copyFile(allFiles);
    return allFiles;
  }

  deleteGroupCode() {
    if (this.config.needDeleteGroupCode) {
      console.log('正在删除业务组代码...');
      const fileSet = this.mainDepend.groupFile;
      this.subDepends.forEach(subDepend => {
        this.appendSet(fileSet, subDepend.groupFile);
      });
      Array.from(fileSet).forEach(file => {
        const targetPath = file.replace(this.config.sourceDir, this.config.targetDir);
        let content = fse.readFileSync(targetPath, 'utf-8');

        const ext = path.extname(file);
        const regExp = ext === '.wxml' ? this.config.groupCodeWxmlRegexp : this.config.groupCodeJsRegexp;
        content = content.replace(regExp, '');
        fse.outputFileSync(targetPath, content);
      });
    }
  }

  replaceComponentsPath(allFiles) {
    console.log('正在取代组件路径...');
    const jsonFiles = allFiles.filter(file => file.endsWith('.json'));
    jsonFiles.forEach(file => {
      const targetPath = file.replace(this.config.sourceDir, this.config.targetDir);
      const content = fse.readJsonSync(targetPath);
      const { usingComponents, replaceComponents } = content;
      // 删除未使用的组件
      let change = false;
      if (usingComponents && typeof usingComponents === 'object' && Object.keys(usingComponents).length) {
        change = this.deleteUnusedComponents(targetPath, usingComponents);
      }
      // 替换组件
      const groupName = this.config.groupName;
      if (
        replaceComponents
        && typeof replaceComponents[groupName] === 'object'
        && Object.keys(replaceComponents[groupName]).length
        && usingComponents
        && Object.keys(usingComponents).length
      ) {
        Object.keys(usingComponents).forEach(key => {
          usingComponents[key] = getReplaceComponent(key, usingComponents[key], replaceComponents[groupName]);
        });
        delete content.replaceComponents;
      }
      // 全部写一遍吧，顺便压缩
      fse.writeJsonSync(targetPath, content);
    });
  }

  /**
   * 删除掉未使用组件
   * @param jsonFile
   * @param usingComponents
   */
  deleteUnusedComponents(jsonFile, usingComponents) {
    let change = false;
    const file = jsonFile.replace('.json', '.wxml');
    if (fse.existsSync(file)) {
      let needDelete = true;
      const tags = new Set();
      const content = fse.readFileSync(file, 'utf-8');
      const htmlParser = new htmlparser2.Parser({
        onopentag(name, attribs = {}) {
          if ((name === 'include' || name === 'import') && attribs.src) {
            // 不删除具有include和import的文件
            needDelete = false;
          }
          tags.add(name);
          const genericNames = getGenericName(attribs);
          genericNames.forEach(item => tags.add(item.toLocaleLowerCase()));
        },
      });
      htmlParser.write(content);
      htmlParser.end();
      if (needDelete) {
        Object.keys(usingComponents).forEach(key => {
          if (!tags.has(key.toLocaleLowerCase())) {
            change = true;
            delete usingComponents[key];
          }
        });
      }
    }
    return change;
  }

  getAllStaticFiles() {
    console.log('正在寻找静态文件...');
    const staticFiles = [];
    this._walkDir(this.config.sourceDir, staticFiles);
    return staticFiles;
  }

  _walkDir(dirname, result) {
    const files = fse.readdirSync(dirname);
    files.forEach(item => {
      const filePath = path.join(dirname, item);
      const data = fse.statSync(filePath);
      if (data.isFile()) {
        if (this.config.staticFileExtends.includes(path.extname(filePath))) {
          result.push(filePath);
        }
      } else if (dirname.indexOf('node_modules') === -1 && !this.config.excludeFiles.includes(dirname)) {
        const can = this.config.excludeFiles.some(file => {
          return dirname.indexOf(file) !== -1;
        });
        if (!can) {
          this._walkDir(filePath, result);
        }
      }
    });
  }

  _copyFile(files) {
    return new Promise((resolve) => {
      let count = 0;
      files.forEach(file => {
        const source = file;
        const target = file.replace(this.config.sourceDir, this.config.targetDir);
        fse.copy(source, target).then(() => {
          // new 新增app.json特殊处理
          if ((this.config.needDeleteSubPackages || this.config.needDeletePages) && source == path.join(this.config.sourceDir, 'app.json')) {
            // 重写app.json subPackages pages tabBar
            const targetContent = fse.readJsonSync(source);
            if (this.config.needDeleteSubPackages) {
              const subPkgs = targetContent.subPackages;
              let newSubPkgs = subPkgs.filter(item => {
                if (!this.config.needDeleteSubPackages.includes(item.root)) {
                  return item
                }
              })
              targetContent.subPackages = newSubPkgs;
            }

            if (this.config.needDeletePages) {
              const pages = targetContent.pages, tabBar = targetContent.tabBar;
              let newList = tabBar.list.filter(item => {
                if (!this.config.needDeletePages.includes(item.pagePath)) {
                  return item
                }
              })
              tabBar.list = newList;
              let newPages = pages.filter(item => {
                if (!this.config.needDeletePages.includes(item)) {
                  return item
                }
              })
              targetContent.tabBar = tabBar;
              targetContent.pages = newPages;
            }

            fse.writeFileSync(target, JSON.stringify(targetContent))
          }
          count++;
          if (count === files.length) {
            resolve();
          }
        }).catch(err => {
          console.error(err);
        });
      });
    });
  }

  /**
   * 过滤pages文件
   * @param {*} files 
   * @returns 
   */
  isDelPages(files) {
    files = files.filter(item => {
      if (path.sep !== '/') {
        item = item.replace(/\\/g, '/');
      }
      let isAdd= true;
      this.config.needDeletePages.filter(element => {
        if(item.indexOf(element) >= 0) {
          isAdd = false;
          console.log('这个没有加载: ', item);
        }
      });

      if(isAdd) return item;
    })

    return files
  }
}

module.exports = {
  DependContainer,
};

// const instance = new DependContainer();
// instance.init().catch(err => console.error(err));

# jackie-miniapp-shaking 微信小程序摇树优化工具
本插件是在miniapp-shaking插件基础上做的开发 用于易职邦整合项目打包代码使用
新增部分功能

原插件使用demo请看这里：[demo](https://github.com/tumblingG/miniapp-shaking-demo)

原插件设计文档请看这里：[文档](https://blog.csdn.net/qq_28506819/category_12079342.html)

## 1.如何使用
 首先安装npm包
```
npm i jackie-miniapp-shaking -D
```
然后在项目下新建一个文件，例如：shaking.js
```javascript
const path = require('path');
const { DependContainer } = require('./node_modules/jackie-miniapp-shaking');
const options = {
  sourceDir: path.join(__dirname, 'miniprogram'),
  targetDir: path.join(__dirname, 'dist'),
  analyseDir: path.join(__dirname, 'analyse'),
  isSplitNpm: true,
  needCustomTabBar: false,
  excludeFiles: ['package-lock.json', 'package.json', 'shaking.js', 'mock.config.json'],
  // 需要打包的分包
  needPages: [
    "pages/home/page",
    "pages/my/page",
    "pages/customize_one/page",
    "pages/customize_two/page",
    "pages/customize_three/page",
    "pages/customize_four/page"
  ], // 需要打包的主页
  needSubPackages: [
    'subPackages/webView',
    'subPackages/honorbook',
    'subPackages/contactBook',
    'subPackages/repository',
    'subPackages/company',
    'subPackages/course',
    'subPackages/recruit',
    'subPackages/work',
    'subPackages/service',
    'subPackages/resumeInvite',
    'subPackages/resume',
    'subPackages/personal',
    'subPackages/point',
    'subPackages/alumni',
    'subPackages/staff',
    'subPackages/singleCard',
    'subPackages/lucky',
    'subPackages/activity',
    'subPackages/news',
    'subPackages/tool',
    'subPackages/shop/index',
    'subPackages/shop/group',
    'subPackages/shop/product',
    'subPackages/shop/address',
    'subPackages/shop/coupons',
    'subPackages/message',
    'subPackages/form',
    'subPackages/shop/order',
    'subPackages/shop/share',
    "subPackages/custom",
    "subPackages/question"
  ]
};

const instance = new DependContainer(options);
instance.init().catch(err => console.error(err));
```
然后执行`node shaking.js`，命令完成后会把摇树后的代码输出到dist目录下，直接上传这个目录即可

## 2.参数Options介绍
 - sourceDir：你的源码目录
 - targetDir： 摇树之后输出的目录，最好定义在你的源码目录之外
 - analyseDir：依赖图的输出目录，摇树优化之后会生成代码的依赖图，类似微信小程序工具那种，不过比他更精细。
 - groupName：项目组名称，对于一个大型公司来说，它的项目公组件、页面可能是有十几个项目组一起开发的，然后在分发成不同的小程序，
 这个项目组名称可以去除掉其他组的业务逻辑，从而大大缩小程序体积，提高性能，使用文档：[组名的作用](https://blog.csdn.net/qq_28506819/article/details/127712605)
 - needDeleteGroupCode 是否需要删除业务组代码，使用文档：[删除业务组代码](https://blog.csdn.net/qq_28506819/article/details/127983251)
 - staticFileExtends：静态文件扩展名，这里面预设了一些，你也可以自己定义。
 - fileExtends：小程序文件扩展名，一般不用传。
 - excludeFiles：需要排除遍历的的一些文件目录，仅限于在一级目录下的文件。
 - isSplitNpm: 是否需要独立分包，这个是更高级的摇树优化，使用文档：[移动独立npm包](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/basic.html)
 - excludeNpms：独立分包需要排除的npm包名称，用于解决一些特殊的情况。
 - needCustomTabBar：是否使用了微信的自定义tabbar，如果使用了必须设置为true，否则不会遍历。
 - needPages: 要打包的主包。
 - needSubPackages: 要打包的分包。

## 3. 注意事项
 - 分包的目录最好在一级目录之下，参考官网[分包](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/basic.html)
 - 如果源码目录下包括了一些脚本文件，如上面的shaking.js，可以加入excludeFiles排除

changelog:
 - bugfix：修复删除业务代码正则匹配越界问题
 - bugfix：修复异步文件没有递归遍历问题
 - bugifx：修复window环境子包正则校验错误问题
 - 增加删除业务代码功能
 - 增加打包分包/主包功能
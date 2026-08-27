/// Apple App Site Association（Universal Links）
/// 与 next-ios 的 Associated Domains 能力配合：
/// 用户在网页上打开 umeh.top 的课程/评价/教授/目录等页面时，
/// iOS 会先请求本文件，命中路径后直接唤起/跳转到 What2REG@UM 对应页面。
///
/// appID 格式：<Team ID>.<Bundle ID>
/// Team ID 见 next-ios/What2REG@UM.xcodeproj/project.pbxproj 的 DEVELOPMENT_TEAM
export const appleAppSiteAssociation = {
  applinks: {
    apps: [],
    details: [
      {
        appID: 'VX3SCAKB5K.top.umeh.What2REG-UM',
        paths: [
          '/course/*',
          '/reviews/*',
          '/professor/*',
          '/submit/*',
          '/catalog',
          '/catalog/*',
          '/search/course/*',
          '/search/instructor/*',
        ],
      },
    ],
  },
}

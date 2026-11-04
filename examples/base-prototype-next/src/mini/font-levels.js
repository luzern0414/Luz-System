// The user's WeChat font size (微信字体大小), as the demo panel offers it. The factor is fontSizeScaleFactor: the user's font size divided by the standard
// one (iOS 17 px, Android 16 px). The values are the iOS 375 px row of WeChat's 适老化设计指南 (16, 17, 18, 19.5, 21, 22, 23.8 px, the last is the care mode).
// A real mini-program reads wx.getAppBaseInfo().fontSizeScaleFactor on launch and on every page show; the prototype takes it from the demo panel.
export const FONT_LEVELS = [
  { id: 'small', label: '小', factor: 0.94 },
  { id: 'std', label: '标准', factor: 1 },
  { id: 'p1', label: '大 +1', factor: 1.06 },
  { id: 'p2', label: '大 +2', factor: 1.15 },
  { id: 'p3', label: '大 +3', factor: 1.24 },
  { id: 'p4', label: '大 +4', factor: 1.29 },
  { id: 'care', label: '关怀模式（1.4 倍）', factor: 1.4 },
]
export const factorOf = (id) => (FONT_LEVELS.find((l) => l.id === id) || FONT_LEVELS[1]).factor

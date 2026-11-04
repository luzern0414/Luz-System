// A simulated request: waits like a network, and fails the way the demo panel's 全局 tab says.
import { state } from './state.js'

export class NetError extends Error {
  constructor(kind) { super(kind === 'offline' ? '网络不可用' : '网络不太稳定'); this.kind = kind; this.name = 'NetError' }
}

/**
 * request(400) resolves after about 400 ms. With the network set to 断网 it rejects at once, with 慢网 it takes five times as long,
 * with 不稳定 about a third of the calls fail. `fail` forces a failure (a scene: "保存失败：商品刚被同事修改过").
 */
export function request(ms = 400, { fail } = {}) {
  return new Promise((resolve, reject) => {
    if (state.net === 'offline') return reject(new NetError('offline'))
    const wait = state.net === 'slow' ? ms * 5 : ms
    setTimeout(() => {
      if (fail) return reject(fail instanceof Error ? fail : new Error(String(fail)))
      if (state.net === 'flaky' && Math.random() < 0.34) return reject(new NetError('flaky'))
      resolve()
    }, state.reducedMotion ? Math.min(wait, 120) : wait)
  })
}

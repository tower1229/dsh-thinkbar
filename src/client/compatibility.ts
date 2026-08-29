/**
 * Client contracts introduced by DeepSeek Harness commit 6d7ae5a. The source
 * checkout still reports 0.1.1-rc.2 even though the npm artifact with that
 * version predates these fields and slot. Keep the declarations with the
 * package so its public types describe the runtime surface it requires.
 */
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface PartialAssistant {
    readonly waitOrigin?: number
    readonly streamTime?: number
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.input.model.decoration': { kind: 'single'; scope: 'session' }
  }
}

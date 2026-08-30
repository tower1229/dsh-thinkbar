# Upstream-compatible reasoning indicator for DeepSeek Harness

Research date: 2026-08-30

- Published `0.1.1-rc.2` source reference:
  [`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`](https://github.com/deepseek-ai/deepseek-harness/tree/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e)
- Upstream `master` at research time:
  [`cd5ef8148158c3a752a658978873241fdf8e2bbc`](https://github.com/deepseek-ai/deepseek-harness/tree/cd5ef8148158c3a752a658978873241fdf8e2bbc)

## Conclusion

The original Harness already exposes enough supported API to implement the
indicator. It does **not** need `PartialAssistant.waitOrigin`,
`PartialAssistant.streamTime`, or
`conversation.input.model.decoration`.

The correct design is:

1. derive a small `reasoning-wait` Conversation projection from official
   `step/start`, `assistant/chunk`, `assistant/message`, `llm/retry`, and
   `step/end` Session events;
2. store `{ waitOrigin, streamTime, active, tailKind }` in that projection;
3. read it from a session-scoped slot component; and
4. use the public `conversation.input.right` list slot as a lifecycle anchor,
   then portal one plugin-owned layer into the uniquely identified model
   trigger.

This preserves exact event-time/replay semantics and catches Tool-only output.
A simpler `useSession(snapshot => snapshot.partial)` heuristic is workable for
reasoning/text streams, but loses the first Tool-call delta and cannot recreate
the stream clock exactly. It should be the fallback, not the primary design.

Upstream exposes the complete model control as one `single` slot, not an
additive decoration child. Filling the built-in button therefore requires a
small version-pinned DOM adapter. The selected adapter depends only on the
composer marker, the trigger's semantic menu-button role, and official Slot
order; it does not depend on generated classes, localized text, React internals,
or the trigger's child structure.

## Evidence: the missing fields are not required

At published `0.1.1-rc.2`, `PartialAssistant` contains only `turn`, `step`, and
`blocks`
([source](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/runtime/src/client/sessions/conversation.ts#L330-L335)).
A repository-wide search of the pinned latest `master` also finds no
`waitOrigin`, `streamTime`, `conversation.input.model.decoration`, or
`reasoning-wait`; its public `PartialAssistant` remains the same three-field
shape
([source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/client/ui-conversation/src/client/contract/records.ts#L278-L286)).

Those fields were one implementation's cached derivation, not a prerequisite
for observing the underlying events. The Session protocol already distinguishes
Turn/Step boundaries and Assistant chunks
([`0.1.1-rc.2` event map](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/types.ts#L231-L266)).
`StreamChunk` distinguishes block start/end, reasoning, text, and Tool-call
deltas
([source](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/llm/llm/src/types.ts#L304-L324)).

## Supported projection API

### Published `0.1.1-rc.2`

The client Runtime exposes the Session, Conversation-event, and Conversation-
view registries as Cordis services
([source](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/runtime/src/client/index.ts#L169-L178)).
`ConversationNodeDefinition` is the public state-machine contract with
`match`, `start`, `update`, `publication`, and `buildViewNode`
([source](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/runtime/src/client/contract/conversation.ts#L164-L228)).

Therefore the plugin can register:

- a `reasoning-wait-step` event definition keyed by `${turn}:${step}`; and
- a `reasoning-wait` view target whose snapshot selects the latest active
  model Step.

The resulting view lives in the same per-Session assembly as Chat. History
replacement, live append, session switch, and registry rebuild/HMR all use the
official assembler rather than component-local guesses.

If the component needs a dedicated selector hook, `sessions.provide()` is the
public per-session standard-props extension point
([source](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/runtime/src/client/contract/sessions.ts#L97-L104)).
For this plugin it is optional: the ordinary `useSession` standard prop can
read `snapshot.views.get('reasoning-wait')`. Every session-scoped slot already
receives `useSession` and `sessionId`
([source](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/runtime/src/client/index.ts#L124-L136)).

### Latest `master`

The ownership moved from the old Runtime package into UI Conversation, but the
same architecture remains public:

- `ctx.uiConversation.events.register(definition)` registers event state
  machines
  ([source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/client/ui-conversation/src/client/conversation/event-registry.ts#L8-L21));
- `ctx.uiConversation.views.register(definition)` registers target builders
  ([source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/client/ui-conversation/src/client/conversation/view-registry.ts#L7-L20)); and
- session slot components receive `useConversation`, which reads the target
  snapshot through `ConversationSnapshot.views`
  ([source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/client/ui-conversation/src/client/contract/slots.ts#L151-L170)).

This is a versioned adapter change, not a loss of capability. One published
plugin build should target one DSH API generation; do not pretend the rc.2 and
current-master package graphs are binary-compatible. The repository warns that
the product is a developer preview with breaking changes
([source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/README.md#L11-L13)).

## Exact state machine

Use the Session event's `time` as the replayable event clock and its `seq` only
for ordering. The official contract defines `time` as Unix epoch milliseconds
and `seq` as the sequence number
([source](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/types.ts#L408-L415)).

Recommended projection state:

```ts
type TailKind = 'empty' | 'reasoning' | 'text' | 'tool' | 'other'

interface ReasoningWaitProjection {
  readonly turn: number
  readonly step: number
  readonly waitOrigin: number
  readonly streamTime: number
  readonly active: boolean
  readonly tailKind: TailKind
}
```

`active` is deliberately `false` until the first reasoning evidence. The
projection still records `waitOrigin` at `step/start`, so a reasoning stream
can include its pre-token wait when it becomes visible, while a thinking-off
request that goes directly to text or Tool output never flashes the indicator.

Transitions:

| Event | Projection action |
| --- | --- |
| `step/start` | Start a new identity; `waitOrigin = streamTime = event.time`, `active = false`, `tailKind = empty`. Do not render yet. |
| reasoning `block-start` / delta / reasoning `block-end` | Advance `streamTime`; keep `active = true`, `tailKind = reasoning`. |
| text `block-start` / delta / text `block-end` | Advance `streamTime`; set `active = false`, `tailKind = text`. |
| Tool-call `block-start` or first Tool delta | Advance `streamTime`; set `active = false`, `tailKind = tool`. This removes the Tool-only blind spot of the partial heuristic. |
| `assistant/message` or `step/end` | Set `active = false`; the component begins or finishes drain. |
| `llm/retry` | Close the current attempt. Define the next-attempt origin explicitly; do not carry elapsed time across attempts accidentally. |

The event definition should also accept the official compact chunk-row forms
used by history assembly, not only scalar `assistant/chunk` events. The shipped
Assistant definition demonstrates how scalar and compact text/reasoning/Tool
runs recover their first-token time
([latest implementation](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/client/ui-chat/src/client/conversation-nodes/assistant.ts#L164-L245)).

For retry, the product must choose one semantic and test it. The closest clean
rule is: end the failed attempt at `llm/retry`; start a fresh wait interval at
the next authoritative attempt boundary/evidence available in that DSH
version. If rc.2 exposes no separate retry-attempt start, use the first new
Assistant block as the new origin rather than reusing the failed Step's old
origin.

## Animation clock

Do not use `Date.now()` as a monotonic animation clock. It can move backward
when the system clock adjusts.

For each new projection snapshot:

1. compute the authoritative event elapsed as
   `max(0, streamTime - waitOrigin)`;
2. capture `performance.now()` as `observedAt`;
3. between events extrapolate
   `elapsed = eventElapsed + (performance.now() - observedAt)`; and
4. clamp against the previously rendered elapsed so the fill never moves
   backward.

This reconstructs the purpose of the old `streamTime` field inside the plugin:
history/replay uses authoritative event elapsed, while live gaps animate with a
browser monotonic clock. Clamp to the existing 20-second scale, retain the
240 ms drain, and make reduced-motion exit immediately.

The component state must be keyed by `sessionId`, `turn`, and `step`. A session
switch or new model Step must never drain or continue another identity's fill.

## Selected UI integration

`conversation.input.right` is an ordered session-scoped list in the composer
tool row. The exact rc.2 render order places this list immediately before the
model seat
([`0.1.1-rc.2` source](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/contract/slots.ts#L195-L231),
[render order](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx#L786-L795)).
The plugin registers a hidden lifecycle anchor there, resolves the only
`button[aria-haspopup="menu"]` following it inside `[data-composer-card]`, and
portals a plugin-owned layer into that button. Zero or multiple candidates
fail closed and produce one compatibility warning.

Recommended registration for rc.2:

```ts
export const inject = ['slots', 'conversationEvents', 'conversationViews']

export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(reasoningWaitDefinition)
  ctx.conversationViews.register(reasoningWaitView)
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'dsh-thinkbar',
    order: 20,
  }, ModelTriggerBridge))
}
```

On latest `master`, adapt only the registry calls to
`ctx.uiConversation.events.register(...)` and
`ctx.uiConversation.views.register(...)`; the component reads the target via
`useConversation`.

The Slot still owns lifecycle and Session scoping. A composer-scoped
`MutationObserver` only re-resolves the adapter after host reconstruction; it
does not discover state or bypass Conversation assembly.

## Why not use only `partial`?

The public snapshot already provides `running`, `partial`, `runningCalls`, and
the Chat timeline. This supports a small implementation:

```ts
const waiting = snapshot.running && (
  snapshot.partial === null
  || snapshot.partial.blocks.length === 0
  || snapshot.partial.blocks.at(-1)?.kind === 'reasoning'
)
```

It is useful as a compatibility fallback, but has three semantic differences:

1. there is no exact wait origin before a partial exists;
2. Tool-call blocks are intentionally non-visible in the Assistant projection,
   so a Tool-only stream may stay “waiting” until `runningCalls` appears; and
3. component-first-observation time cannot reproduce history/replay timing.

The latest Chat assembler explicitly treats text and reasoning as visible but
Tool-call blocks as non-visible
([source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/client/ui-chat/src/client/conversation-nodes/assistant.ts#L63-L82)).
That is why the event-derived projection is preferred.

## Rejected approaches

### Replacing `conversation.input.model`

The model selector occupies a `single` slot and owns the full model
affordance. Replacing it makes this plugin responsible for model selection and
creates a collision with the official occupant
([rc.2 slot contract](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/contract/slots.ts#L252-L271),
[latest registration](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/client/ui-model-selection/src/client/index.ts#L155-L169)).

### Uncontrolled model-selector DOM mutation

Class selectors, localized text lookup, React private fields, subtree rewrites,
and replacing or wrapping host children remain rejected. The selected adapter
instead starts at an official Slot anchor, uses a semantic button role, owns
exactly one inserted layer, fails closed on ambiguity, and removes only its own
DOM on teardown. This is intentionally a versioned compatibility adapter, not
a new upstream extension contract. The upstream authoring rules still explain
why the lifecycle entry must cross the package seam through Slots
([source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/client/AGENTS.md#L30-L40)).

### Adding a transcript row

A keyed `conversation.chat.node` renderer is appropriate for durable or
streaming conversation content. The wait indicator is transient composer
chrome; rendering it in the transcript changes the product behavior and is
unnecessary when a composer list slot exists.

## Package and implementation recommendation

For this repository's currently fixed `0.1.1-rc.2` baseline:

1. keep that baseline and replace the declaration-merge shim with the public
   rc.2 Conversation definition/view APIs;
2. register a `conversation.input.right` lifecycle anchor and mount a
   fail-closed DOM adapter instead of the absent model decoration slot;
3. move `waitOrigin` and `streamTime` derivation into the plugin-owned
   Conversation projection;
4. retain the 20-second iron-scale curve, 240 ms drain, reduced-motion behavior,
   particles, and session-switch reset;
5. preserve the model-button fill while never rewriting host children;
6. test scalar chunks, compact replay rows, reasoning-to-text, Tool-only output,
   retries, Step close, Session switch, reduced motion, and HMR teardown; and
7. run a real installed rc.2 Web Profile smoke.

The browser package still uses the normal official envelope:
`dsh.client.platform: "web"` and a built lazy-CJS `./client` export
([module-system contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/docs/subsystems/client-modules.md#L72-L82)).

This is an installable plugin for original DeepSeek Harness. It preserves the
state-machine and timing behavior without private runtime fields. Its only
private-host dependency is isolated in a fail-closed, rc.2-pinned DOM adapter.

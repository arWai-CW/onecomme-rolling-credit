<script lang="ts">
  import Credits from '../components/Credits.svelte'
  import { fetchState } from '../lib/api'
  import { demoState } from '../lib/demo'
  import type { PersistedState } from '../../shared/types'

  const POLL_MS = 2000
  const params = new URLSearchParams(location.search)
  const demo = params.has('demo')

  // The credits are a snapshot taken when playback starts, so the layout does not
  // jump while scrolling. A replay (button in the settings page) takes a new snapshot.
  let snapshot: PersistedState | undefined = $state(demo ? demoState() : undefined)
  let pro = $state(false)
  let playKey = $state(0)
  let lastToken: number | undefined
  let error = $state('')

  async function poll() {
    try {
      const s = await fetchState()
      error = ''
      pro = s.pro
      if (lastToken === undefined || s.replayToken !== lastToken) {
        lastToken = s.replayToken
        snapshot = demo ? demoState(s.settings) : s
        playKey += 1
      }
    } catch (e) {
      // Keep the current snapshot; OneComme may be restarting.
      error = e instanceof Error ? e.message : String(e)
      if (demo && lastToken === undefined) playKey = playKey || 1
    }
  }

  $effect(() => {
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  })
</script>

{#if snapshot && playKey > 0}
  <Credits data={snapshot} {pro} {playKey} />
{/if}
{#if error && params.has('debug')}
  <p class="error">{error}</p>
{/if}

<style>
  .error {
    position: fixed;
    left: 8px;
    bottom: 8px;
    margin: 0;
    color: #f66;
    font: 12px monospace;
  }
</style>

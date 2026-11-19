<script lang="ts">
  import Credits from '../components/Credits.svelte'
  import { fetchState, postAction } from '../lib/api'
  import { demoState } from '../lib/demo'
  import { DEFAULT_SETTINGS, SECTION_DEFAULT_TITLES } from '../../shared/defaults'
  import { activeSessions, buildCredits } from '../../shared/credits'
  import { PLUGIN_UID, type SectionKey, type Settings, type StateResponse } from '../../shared/types'

  const SECTION_LABELS: Record<SectionKey, string> = {
    raids: '降落（Raid / 重新導向）',
    members: '新會員（加入 + 被贈送）',
    gifts: '會員贈送者',
    donations: 'Super Chat / Super Sticker',
    milestones: '會員里程碑',
  }

  const overlayUrl = `http://localhost:11180/plugins/${PLUGIN_UID}/index.html`

  let server: StateResponse | undefined = $state()
  let settings: Settings = $state(structuredClone(DEFAULT_SETTINGS))
  let loadError = $state('')
  let toast = $state('')
  let saving = $state(false)
  type PreviewMode = 'off' | 'live' | 'demo'
  let previewMode = $state<PreviewMode>('off')
  let previewKey = $state(0)
  let raidName = $state('')
  let dragIndex: number | undefined = $state()
  let pw = $state(0)
  let ph = $state(0)
  const scale = $derived(Math.max(0.05, Math.min((pw - 32) / 1920, (ph - 96) / 1080)))

  const dirty = $derived(server ? JSON.stringify(server.settings) !== JSON.stringify(settings) : false)
  const youtubeServices = $derived(server?.services ?? [])
  const counts = $derived.by(() => {
    if (!server) return undefined
    const live = { ...server, settings: { ...settings, sections: settings.sections.map((s) => ({ ...s, enabled: true })) } }
    const map = Object.fromEntries(buildCredits(live).map((s) => [s.key, s.rows.length])) as Partial<Record<SectionKey, number>>
    return map
  })
  const sessionInfo = $derived(server ? activeSessions({ ...server, settings }) : [])
  const previewState = $derived(
    previewMode === 'demo' ? demoState($state.snapshot(settings)) : server ? { ...server, settings: $state.snapshot(settings) } : undefined,
  )

  function showToast(msg: string) {
    toast = msg
    setTimeout(() => {
      if (toast === msg) toast = ''
    }, 2500)
  }

  async function load() {
    try {
      const s = await fetchState()
      server = s
      settings = structuredClone(s.settings)
      loadError = ''
    } catch (e) {
      loadError = `無法連線到 OneComme（${e instanceof Error ? e.message : e}）。請確認 OneComme 已啟動，並已啟用本插件。`
    }
  }

  async function refreshStats() {
    try {
      const s = await fetchState()
      // Keep unsaved setting edits.
      server = { ...s, settings: server?.settings ?? s.settings }
    } catch {
      // ignore; the next poll retries
    }
  }

  async function run(label: string, action: Parameters<typeof postAction>[0]) {
    saving = true
    try {
      const s = await postAction(action)
      const keepEdits = action.action !== 'settings' && dirty
      server = s
      if (!keepEdits) settings = structuredClone(s.settings)
      showToast(label)
    } catch (e) {
      showToast(`失敗：${e instanceof Error ? e.message : e}`)
    } finally {
      saving = false
    }
  }

  const save = () => run('已儲存', { action: 'settings', settings: $state.snapshot(settings) })
  const replay = () => run('已送出重新播放', { action: 'replay' })
  function reset() {
    if (confirm('要清除本次直播的所有統計資料嗎？這個動作無法復原。')) run('已重設', { action: 'reset' })
  }
  function addRaid(e: SubmitEvent) {
    e.preventDefault()
    if (!raidName.trim()) return
    run('已新增降落', { action: 'addRaid', name: raidName.trim() }).then(() => {
      raidName = ''
    })
  }
  const removeRaid = (id: string) => run('已刪除降落', { action: 'removeRaid', id })

  function move(from: number, to: number) {
    if (to < 0 || to >= settings.sections.length || from === to) return
    const list = [...settings.sections]
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item!)
    settings.sections = list
  }

  function toggleService(id: string, counted: boolean) {
    const set = new Set(settings.excludedServices)
    if (counted) set.delete(id)
    else set.add(id)
    settings.excludedServices = [...set]
  }

  function copyUrl() {
    navigator.clipboard?.writeText(overlayUrl).then(
      () => showToast('已複製網址'),
      () => showToast('複製失敗，請手動選取'),
    )
  }

  function openPreview(mode: 'live' | 'demo') {
    previewMode = mode
    previewKey += 1
  }

  $effect(() => {
    load()
    const timer = setInterval(refreshStats, 5000)
    return () => clearInterval(timer)
  })
</script>

<main>
  <header>
    <h1>片尾滾動名單 設定</h1>
    <p class="hint">在 OBS 新增「瀏覽器來源」，網址填入下方網址，寬高 1920 × 1080，並勾選「場景啟用時重新整理瀏覽器」。</p>
    <div class="url">
      <code>{overlayUrl}</code>
      <button type="button" onclick={copyUrl}>複製</button>
    </div>
  </header>

  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
    <button type="button" onclick={load}>重試</button>
  {:else if !server}
    <p>載入中…</p>
  {:else}
    <section class="card">
      <h2>本次直播</h2>
      {#if sessionInfo.length === 0}
        <p class="muted">尚未收到任何會員 / Super Chat / 降落事件。</p>
      {:else}
        <ul class="sessions">
          {#each sessionInfo as s (s.serviceId)}
            <li>
              <strong>{s.serviceName || s.serviceId}</strong>
              <span class="muted">liveId: {s.liveId || '—'} · 開始 {new Date(s.startedAt).toLocaleString('zh-TW')}</span>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="row">
        <button type="button" onclick={replay} disabled={saving}>▶ 重新播放（OBS）</button>
        <button type="button" onclick={() => openPreview('live')}>預覽目前資料</button>
        <button type="button" onclick={() => openPreview('demo')}>載入假資料預覽</button>
        <button type="button" class="danger" onclick={reset} disabled={saving}>手動重設</button>
      </div>
      <p class="muted small">出現新的 liveId（新的直播）時，會自動重設該枠的資料。</p>
    </section>

    {#if youtubeServices.length > 1}
      <section class="card">
        <h2>統計的枠</h2>
        {#each youtubeServices as svc (svc.id)}
          <label class="check">
            <input
              type="checkbox"
              checked={!settings.excludedServices.includes(svc.id)}
              onchange={(e) => toggleService(svc.id, e.currentTarget.checked)}
            />
            {svc.name}
          </label>
        {/each}
      </section>
    {/if}

    <section class="card">
      <h2>區塊（拖曳或使用箭頭調整順序）</h2>
      <ol class="sections">
        {#each settings.sections as section, i (section.key)}
          <li
            draggable="true"
            class:dragging={dragIndex === i}
            ondragstart={() => (dragIndex = i)}
            ondragover={(e) => e.preventDefault()}
            ondrop={(e) => {
              e.preventDefault()
              if (dragIndex !== undefined) move(dragIndex, i)
              dragIndex = undefined
            }}
            ondragend={() => (dragIndex = undefined)}
          >
            <span class="handle" aria-hidden="true">⋮⋮</span>
            <label class="check">
              <input type="checkbox" bind:checked={section.enabled} />
              {SECTION_LABELS[section.key]}
              <span class="badge">{counts?.[section.key] ?? 0}</span>
            </label>
            <input
              class="title"
              type="text"
              aria-label="{SECTION_LABELS[section.key]} 標題"
              placeholder={SECTION_DEFAULT_TITLES[section.key]}
              bind:value={section.title}
            />
            <span class="arrows">
              <button type="button" aria-label="上移" onclick={() => move(i, i - 1)} disabled={i === 0}>↑</button>
              <button
                type="button"
                aria-label="下移"
                onclick={() => move(i, i + 1)}
                disabled={i === settings.sections.length - 1}>↓</button
              >
            </span>
          </li>
        {/each}
      </ol>
      <p class="muted small">沒有資料的區塊會自動隱藏。降落偵測需要 OneComme v9.2.0 以上，屬於試驗功能；YouTube 不提供降落人數。</p>
    </section>

    <section class="card">
      <h2>手動補上降落</h2>
      <form class="row" onsubmit={addRaid}>
        <input type="text" placeholder="頻道名稱" aria-label="頻道名稱" bind:value={raidName} maxlength="100" required />
        <button type="submit" disabled={saving}>新增</button>
      </form>
      {#if server.manualRaids.length || sessionInfo.some((s) => s.raids.length)}
        <ul class="raids">
          {#each [...sessionInfo.flatMap((s) => s.raids), ...server.manualRaids] as r (r.id)}
            <li>
              {r.name}
              <span class="muted small">{r.manual ? '手動' : '自動'}</span>
              <button type="button" class="link" onclick={() => removeRaid(r.id)}>刪除</button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="card grid">
      <h2>顯示</h2>
      <label>Super Chat 排序
        <select bind:value={settings.donationSort}>
          <option value="time">依時間</option>
          <option value="amount">依金額（以固定匯率換算，只用來排序）</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" bind:checked={settings.showAvatars} /> 顯示頭像</label>
      <label>捲動速度（px / 秒）<input type="number" min="5" max="2000" bind:value={settings.speed} /></label>
      <label>最長時間（秒，0 = 不限制）<input type="number" min="0" max="3600" bind:value={settings.maxDuration} /></label>
      <label>開始前等待（秒）<input type="number" min="0" max="60" step="0.5" bind:value={settings.startDelay} /></label>
      <label>結尾停留（秒）<input type="number" min="0" max="600" step="0.5" bind:value={settings.endHold} /></label>
      <label>淡出時間（秒，0 = 不淡出）<input type="number" min="0" max="60" step="0.5" bind:value={settings.fadeOut} /></label>
      <label>結尾標題<input type="text" bind:value={settings.endTitle} /></label>
      <label>結尾副標題<input type="text" bind:value={settings.endSubtitle} /></label>
      <label>字型（CSS font-family）<input type="text" bind:value={settings.fontFamily} /></label>
      <label>文字大小倍率<input type="number" min="0.3" max="4" step="0.1" bind:value={settings.fontScale} /></label>
      <label>文字顏色<input type="color" bind:value={settings.textColor} /></label>
      <label>標題顏色<input type="color" bind:value={settings.accentColor} /></label>
      {#if server.pro}
        <label class="check"><input type="checkbox" bind:checked={settings.showCredit} /> 顯示 OneComme credit</label>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={settings.debugLog} /> 除錯：把原始事件寫入 plugin.log</label>
    </section>

    <div class="savebar">
      <button type="button" class="primary" onclick={save} disabled={saving || !dirty}>{dirty ? '儲存設定' : '已儲存'}</button>
    </div>
  {/if}

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}
</main>

{#if previewMode !== 'off' && previewState}
  <div class="preview" role="dialog" aria-modal="true" aria-label="預覽" bind:clientWidth={pw} bind:clientHeight={ph}>
    <div class="stage" style:width="{1920 * scale}px" style:height="{1080 * scale}px">
      <div class="scaled" style:transform="scale({scale})">
        <Credits data={previewState} pro={server?.pro ?? false} playKey={previewKey} />
      </div>
    </div>
    <div class="row">
      <button type="button" onclick={() => (previewKey += 1)}>重新播放</button>
      <button type="button" onclick={() => (previewMode = 'off')}>關閉</button>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    background: #16171d;
    color: #e8e8ee;
    font-family: system-ui, 'Noto Sans TC', 'PingFang TC', sans-serif;
    font-size: 15px;
  }
  main {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 16px 96px;
  }
  h1 { font-size: 1.5rem; margin: 0 0 8px; }
  h2 { font-size: 1.05rem; margin: 0 0 12px; }
  .hint, .muted { color: #a3a5b3; }
  .small { font-size: 0.85rem; }
  .url { display: flex; gap: 8px; align-items: center; margin: 8px 0 16px; }
  code { background: #23252e; padding: 6px 10px; border-radius: 6px; user-select: all; overflow-wrap: anywhere; }
  .card { background: #1e2028; border: 1px solid #2c2f3a; border-radius: 10px; padding: 16px; margin: 16px 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
  .grid h2 { grid-column: 1 / -1; margin: 0; }
  label { display: flex; flex-direction: column; gap: 4px; }
  label.check { flex-direction: row; align-items: center; gap: 8px; }
  input[type='text'], input[type='number'], select {
    background: #14151a; color: inherit; border: 1px solid #3a3d4a; border-radius: 6px; padding: 6px 8px; font: inherit;
  }
  input[type='color'] { width: 64px; height: 32px; background: none; border: none; }
  button {
    background: #2e3140; color: inherit; border: 1px solid #444859; border-radius: 6px; padding: 6px 12px; font: inherit; cursor: pointer;
  }
  button:hover:not(:disabled) { background: #3a3e52; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #8ab4ff; outline-offset: 2px; }
  .primary { background: #3d6bff; border-color: #3d6bff; }
  .primary:hover:not(:disabled) { background: #5580ff; }
  .danger { border-color: #a54848; color: #ffb3b3; }
  .link { background: none; border: none; color: #ff9b9b; padding: 0 4px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
  .error { color: #ff8a8a; }
  .sessions, .raids { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
  .sessions li { display: flex; flex-direction: column; }
  ol.sections { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  ol.sections li {
    display: grid; grid-template-columns: auto 1fr 1fr auto; gap: 10px; align-items: center;
    background: #23252e; border: 1px solid #2f3240; border-radius: 8px; padding: 8px 10px;
  }
  ol.sections li.dragging { opacity: 0.5; }
  .handle { cursor: grab; color: #777a8a; user-select: none; }
  .badge { background: #3a3e52; border-radius: 999px; padding: 0 8px; font-size: 0.8rem; }
  .arrows { display: flex; gap: 4px; }
  .arrows button { padding: 2px 8px; }
  .savebar {
    position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: center;
    padding: 12px; background: rgb(22 23 29 / 0.92); border-top: 1px solid #2c2f3a;
  }
  .toast {
    position: fixed; right: 16px; bottom: 72px; background: #2e3140; border: 1px solid #444859;
    border-radius: 8px; padding: 8px 14px;
  }
  .preview {
    position: fixed; inset: 0; background: rgb(0 0 0 / 0.8); display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px; z-index: 10;
  }
  /* 1920x1080 stage scaled down to fit */
  .stage {
    overflow: hidden;
    background: repeating-conic-gradient(#2a2a2a 0 25%, #333 0 50%) 0 0 / 32px 32px;
    border: 1px solid #555;
  }
  .scaled {
    width: 1920px; height: 1080px; transform-origin: 0 0;
    position: relative;
    /* Make the fixed-position viewport inside Credits relative to this box */
    contain: layout paint;
  }
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; }
    ol.sections li { grid-template-columns: auto 1fr; }
  }
</style>

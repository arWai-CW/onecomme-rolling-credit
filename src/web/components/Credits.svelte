<script lang="ts">
  import { buildCredits, scrollTimeline } from '../../shared/credits'
  import type { PersistedState } from '../../shared/types'

  interface Props {
    data: PersistedState
    pro: boolean
    /** Change this value to restart the scroll from the beginning */
    playKey: number
  }

  let { data, pro, playKey }: Props = $props()

  const sections = $derived(buildCredits(data))
  const settings = $derived(data.settings)
  const showCredit = $derived(!pro || settings.showCredit)

  let viewport: HTMLDivElement | undefined = $state()
  let track: HTMLDivElement | undefined = $state()
  let ending: HTMLDivElement | undefined = $state()

  let animations: Animation[] = []

  /**
   * Timeline (all at the same speed):
   * 1. The list (track) scrolls up from below the screen until it has fully left the top.
   * 2. The ending follows the list and stops at the center of the screen.
   * 3. When both are done (the area above the ending is empty), the ending stays
   *    for `endHold` seconds, then fades out over `fadeOut` seconds.
   */
  function play() {
    if (!viewport || !track || !ending) return
    for (const a of animations) a.cancel()
    animations = []

    const vh = viewport.clientHeight
    const trackH = track.offsetHeight
    const endH = ending.offsetHeight
    const gap = trackH > 0 ? (parseFloat(getComputedStyle(track).rowGap) || 0) * 2 : 0

    const trackFrom = vh
    // Extra distance so text-shadow / avatar shadow is also fully off screen.
    const overflow = parseFloat(getComputedStyle(viewport).fontSize) * 2
    const trackTo = -trackH - overflow
    const endFrom = vh + trackH + gap
    const endTo = (vh - endH) / 2

    const t = scrollTimeline(trackFrom - trackTo, endFrom - endTo, settings)
    const delay = settings.startDelay * 1000

    if (trackH > 0) {
      animations.push(
        track.animate([{ transform: `translateY(${trackFrom}px)` }, { transform: `translateY(${trackTo}px)` }], {
          duration: Math.max(1, t.track * 1000),
          delay,
          easing: 'linear',
          fill: 'both',
        }),
      )
    }
    animations.push(
      ending.animate([{ transform: `translateY(${endFrom}px)` }, { transform: `translateY(${endTo}px)` }], {
        duration: Math.max(1, t.ending * 1000),
        delay,
        easing: 'linear',
        fill: 'both',
      }),
    )
    if (settings.fadeOut > 0) {
      animations.push(
        ending.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: settings.fadeOut * 1000,
          delay: delay + t.total * 1000 + settings.endHold * 1000,
          easing: 'ease-in-out',
          fill: 'both',
        }),
      )
    }
  }

  $effect(() => {
    // Restart when the play key changes (initial load, OBS scene activation, replay button).
    void playKey
    // Wait for avatars / fonts to settle the layout before measuring.
    let cancelled = false
    const start = async () => {
      await document.fonts?.ready
      await Promise.all(
        [...(track?.querySelectorAll('img') ?? [])].map((img) =>
          img.complete ? undefined : new Promise((r) => ((img.onload = r), (img.onerror = r))),
        ),
      )
      if (!cancelled) play()
    }
    start()
    return () => {
      cancelled = true
    }
  })
</script>

<div
  class="viewport"
  bind:this={viewport}
  style:--text={settings.textColor}
  style:--accent={settings.accentColor}
  style:--font={settings.fontFamily}
  style:--scale={settings.fontScale}
>
  <div class="track" bind:this={track}>
    {#each sections as section (section.key)}
      <section class="section" aria-label={section.title}>
        <h2>{section.title}</h2>
        <ul>
          {#each section.rows as row (row.key)}
            <li>
              {#if row.profileImage}
                <img src={row.profileImage} alt="" referrerpolicy="no-referrer" />
              {/if}
              <span class="name">{row.name}</span>
              {#if row.detail}
                <span class="detail">{row.detail}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>

  <div class="ending" bind:this={ending}>
    <h1>{settings.endTitle}</h1>
    {#if settings.endSubtitle}
      <p>{settings.endSubtitle}</p>
    {/if}
    {#if showCredit}
      <p class="credit">Powered by わんコメ</p>
    {/if}
  </div>
</div>

<style>
  .viewport {
    position: fixed;
    inset: 0;
    overflow: hidden;
    color: var(--text);
    font-family: var(--font);
    font-size: calc(32px * var(--scale));
    text-shadow:
      0 0 0.25em rgb(0 0 0 / 0.9),
      0 0.05em 0.1em rgb(0 0 0 / 0.9);
  }

  .track,
  .ending {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    /* Off screen until the animation starts */
    transform: translateY(100vh);
    will-change: transform, opacity;
  }

  .track {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3.5em;
  }

  .section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1em;
    width: min(90%, 40em);
  }

  h2 {
    margin: 0;
    font-size: 1.25em;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--accent);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55em;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.5em;
    line-height: 1.3;
  }

  img {
    width: 1.4em;
    height: 1.4em;
    border-radius: 50%;
    object-fit: cover;
    box-shadow: 0 0 0.2em rgb(0 0 0 / 0.6);
  }

  .name {
    font-weight: 600;
  }

  .detail {
    font-size: 0.8em;
    opacity: 0.85;
    font-variant-numeric: tabular-nums;
  }

  .ending {
    text-align: center;
    padding: 2em 0;
  }

  .ending h1 {
    margin: 0;
    font-size: 2.4em;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  .ending p {
    margin: 0.5em 0 0;
    font-size: 1em;
    opacity: 0.9;
  }

  /* Required by OneComme's terms for free users; kept as unobtrusive as possible. */
  .ending .credit {
    margin: 2.5em 0 0;
    font-size: 11px;
    opacity: 0.35;
    text-shadow: none;
    letter-spacing: 0.05em;
  }

  @media (prefers-reduced-motion: reduce) {
    .track,
    .ending {
      will-change: auto;
    }
  }
</style>

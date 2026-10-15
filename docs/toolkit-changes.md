# Our changes to toolkit components

The components in `src/components/ui/` are copied from neobrutalism.com (Base UI set) and are ours to change.
Every deliberate change is listed here, so it isn't lost if a component is reinstalled. Check with
`node scripts/check-components.mjs`: it compares each file with neobrutalism.com and reports files named
below as "changed on purpose".

Not counted as changes: the installer's own small rewrites as it installs a file (dropping `"use client"`,
`cn-…` placeholder classes, reflowed lines). The check script allows for those.

| File | Change | Why | Date |
|---|---|---|---|
| `src/components/ui/sonner.tsx` | Takes light/dark from our theme (`useCurrentTheme` in `src/lib/use-theme.ts`) instead of the `next-themes` package | `next-themes` belongs to a different framework set-up and doesn't know about our switch, so toasts would have followed the computer's setting, not the user's choice | 7 Oct 2026 |
| `src/components/ui/switch.tsx` | Track and thumb outlines use the border colour (`border-border`) instead of the text colour (`border-foreground`) | In dark mode the text colour is cream, so switches had a white outline unlike every other component. Light mode unchanged: both colours are black there | 7 Oct 2026 |
| `src/components/ui/button.tsx` | A `dashed` variant: a dashed 2px outline in the border colour, no drop shadow and no lift, the accent tint on hover (as `ghost`) | Compare versions' folded lists: a "Show 27 rows" button where the list goes. The outline variant's shadow showed as solid right and bottom edges, which a dashed box shouldn't have. The toolkit has no dashed or flat outlined button; added here so the look stays in the component file | 14 Oct 2026 |
| `src/components/ui/checkbox.tsx` | When "some ticked" (`indeterminate`), shows a dash instead of a tick, and is filled with the accent like a ticked box | The toolkit drew a tick for "some ticked" too, which reads as "all". Needed by Settings' "Families shown" group ticks | 8 Oct 2026 |

## Theme additions (in `src/theme.css`, not component files)

- `secondary-hover`, `chart-1` (warning) and `chart-2` (success): used by the button and toast components but
  not defined in the toolkit's theme (7 Oct 2026).
- The app's look (7 Oct 2026): Atkinson Hyperlegible Next for text and Mono for names (replacing
  Space Grotesk); twelve accent presets picked by `data-accent`, Amber the default; `primary-hover`, `accent`
  (hover background) and dark `ring` worked out from the accent instead of fixed colours. Dark-mode borders
  stay the toolkit's black.
- `favourite` and `favourite-edge` (10 Oct 2026): the Favourites star's amber `#ffad30` whatever the accent, with a
  black edge in light mode and no visible edge in dark.

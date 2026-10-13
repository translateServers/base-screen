'@base-screen/engine': minor
---

Re-base the designer panels on the ported design system. The left rail becomes the prototype's
raised 48px tab strip (60px vertical tabs, pill selection with the accent icon), the panel header
gains the count pill and a BUILTIN/HOST/PLUGIN scope label, material cards move to the neutral
grid-textured thumbnails with 8px radii, layer rows use the accent-surface primary selection
(pill) and the neutral secondary tier, inspector tabs become left-aligned light pills, sections
get the hairline title row, and the command palette cards plus toasts drop their borders for
shadow rings (toast tones now colour the icon only). Enumerated controls render through a new
custom select (trigger + popover + hidden native select) in the inspector, canvas settings and
the dataset role binding, keeping the native element as the value carrier.

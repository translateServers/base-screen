'@base-screen/engine': minor
'@base-screen/plugin-core': minor
---

Rework the designer's form-control layer on the ported design system. Native `title` tooltips are
replaced by a single `data-tip` floating layer (delayed reveal, instant on keyboard focus, Escape
suppression, hit-scan fallback for disabled controls), control geometry and states follow the
prototype (30px controls, shadow borders, hover/focus/error/success/disabled/readonly/mixed),
checkboxes gain the indeterminate glyph, buttons become borderless with a hover that only changes
the surface, and the four bespoke segmented controls share one shape. Two controls are added: a
stepper (`- / value / +` with bounds) declared through the material editor descriptor vocabulary
as `control: 'stepper'` (requires a bounded number field), and a date field (input + anchored
calendar popover) used by dataset parameters of type `date`. The data workbench's limited
multi-field binding gets the chip trigger and type-tagged popover from the prototype.

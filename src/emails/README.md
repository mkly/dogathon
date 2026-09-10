# Email presentation

The HTML templates share `email-design.tsx`: a table-backed React Email shell,
system-font typography, restrained Pawcast colors, fluid images, and one button
style. They intentionally do not load web fonts or reuse the site's decorative
text effects.

Run `npm run email:previews`, then open `.email-previews/index.html` to compare
the representative regular, graduation, transferred, and ended messages at
320px, 390px, and desktop widths. These are local renders and never send mail.

Compatibility expectations:

- Gmail and Apple Mail retain the inline typography, spacing, colors, fluid
  images, and buttons.
- Desktop Outlook can ignore rounded corners, but React Email's table markup and
  the inline sizing preserve the hierarchy and readable single-column layout.
- Blocked or missing images leave meaningful headings and body copy. Image
  dimensions remain fluid, and alternative text names the companion.

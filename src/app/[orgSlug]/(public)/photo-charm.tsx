import styles from "./photo-charm.module.css";

const shapes = [
  // Heart, star, flower, and leaf; the inset copy follows the same silhouette.
  "M32 56 C22 49 5 36 5 22 C5 7 23 3 32 17 C41 3 59 7 59 22 C59 36 42 49 32 56Z",
  "M32 5 L40 23 L59 25 L45 38 L49 58 L32 48 L15 58 L19 38 L5 25 L24 23Z",
  "M32 17 C40 0 58 10 48 26 C67 29 60 49 43 44 C43 63 21 63 21 44 C4 50 -2 29 16 25 C7 8 25 0 32 17Z",
  "M12 54 C0 28 24 8 54 8 C61 33 43 62 12 54Z",
];
const tones = ["denim", "mustard", "moss"] as const;

export function PhotoCharm({ id }: { id: string }) {
  // A shuffled-looking arrangement that stays put on refresh and filtering.
  let seed = 0;
  for (const character of id) {
    seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  }
  const firstShape = seed % shapes.length;
  const firstTone = (seed >>> 4) % tones.length;
  const secondShape =
    (firstShape + 1 + ((seed >>> 12) % (shapes.length - 1))) % shapes.length;
  const secondTone =
    (firstTone + 1 + ((seed >>> 16) % (tones.length - 1))) % tones.length;
  const remainingShapes = shapes.filter(
    (_, index) => index !== firstShape && index !== secondShape,
  );
  const charms = [
    {
      shape: shapes[firstShape],
      tone: tones[firstTone],
      angle: -12 + ((seed >>> 8) % 13),
      x: 0,
      y: 0,
    },
    {
      shape: shapes[secondShape],
      tone: tones[secondTone],
      angle: 4 + ((seed >>> 20) % 13),
      x: 28,
      y: 8,
    },
    {
      shape: remainingShapes[(seed >>> 24) % remainingShapes.length],
      tone: tones[3 - firstTone - secondTone],
      angle: -8 + ((seed >>> 27) % 17),
      x: 12,
      y: 30,
    },
  ];
  const textureId = `photo-charm-fabric-${id}`;

  return (
    <svg
      className={styles.charm}
      viewBox="0 0 92 94"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id={textureId}
          patternUnits="userSpaceOnUse"
          width="160"
          height="160"
        >
          <image href="/textures/fabric-tile.webp" width="160" height="160" />
        </pattern>
      </defs>
      {charms.map(({ shape, tone, angle, x, y }) => (
        <g
          key={shape}
          className={`${styles.patch} felt-${tone}`}
          transform={`translate(${x} ${y}) rotate(${angle} 32 32)`}
        >
          <path className={styles.felt} d={shape} />
          <path
            className={styles.texture}
            d={shape}
            fill={`url(#${textureId})`}
          />
          <g className={styles.seam} transform="translate(6.4 6.4) scale(.8)">
            <path className={styles.shadow} d={shape} />
            <path className={styles.thread} d={shape} />
          </g>
        </g>
      ))}
    </svg>
  );
}

export type UpdatePhoto = {
  alt: string;
  caption: string;
  src: string;
};

export const updateFixture = {
  companionId: "56d7f1b9-4e37-4b92-bbf5-29e7548436e0",
  companionName: "Juniper",
  date: "September 4, 2026",
  headline: "Juniper discovers the best seat in the house",
  rescueName: "Harbor Light Rescue",
  teaser:
    "Juniper has found her rhythm at the rescue: sunny naps, gentle introductions, and a new talent for making every volunteer slow down and stay awhile.",
  body: `Juniper has spent the last few weeks learning that a quiet morning can be a very good thing. She used to greet every sound in the hallway with a worried look and a quick trip to the back of her run. Now, when the first volunteers arrive, she stretches out on her blanket and waits for someone to say hello.

Her favorite ritual happens just after breakfast. A volunteer named Maya opens the side door to the little reading room, and Juniper trots in to inspect the pillows. She turns around three careful times, settles beside the window, and watches the garden wake up. Sparrows land on the fence. Delivery vans come and go. Juniper notices all of it, but she no longer feels responsible for managing the whole world.

## A gentler kind of brave

We have been introducing Juniper to new people one at a time. She does best when visitors sit nearby and let her make the first move. Usually she starts with a long sniff, steps away to think, then returns with a toy. Last Tuesday she surprised everyone by placing her stuffed fox directly in a guest’s lap. It was a small moment, but it told us how much safer she is beginning to feel.

Outside, Juniper is becoming an enthusiastic trail companion. She keeps a comfortable pace, checks in often, and has learned to pause while bicycles pass. Her loose-leash walking still disappears when a squirrel makes an appearance, so we are practicing with plenty of distance and very good treats.

The nicest change is what happens after those adventures. Juniper comes back, drinks some water, and falls asleep with one paw tucked under her chin. She is learning that excitement can end in rest instead of worry.

This progress belongs to a whole circle of people who make steady care possible. Thank you for following along while Juniper grows into herself. We cannot promise exactly what her next chapter will look like, but right now it includes sunny windows, patient friends, and a growing collection of toys she carries from room to room.`,
  photos: [
    {
      alt: "A golden retriever standing calmly in a sunlit field",
      caption: "Juniper pauses in the field before the morning walk.",
      src: "https://images.unsplash.com/photo-1536808479791-c373702f3636?auto=format&fit=crop&w=1600&q=85",
    },
    {
      alt: "A close portrait of a golden retriever looking into the distance",
      caption: "Watching the garden wake up from a favorite quiet spot.",
      src: "https://images.unsplash.com/photo-1695519794923-8b0fe4fc8008?auto=format&fit=crop&w=1600&q=85",
    },
    {
      alt: "A golden retriever lying in bright green grass",
      caption: "A mid-walk grass break is now part of the routine.",
      src: "https://images.unsplash.com/photo-1629955822542-7f10309b61b5?auto=format&fit=crop&w=1600&q=85",
    },
    {
      alt: "A golden retriever sitting in a warmly lit room",
      caption: "Back inside, settled in the afternoon light.",
      src: "https://images.unsplash.com/photo-1597157436552-f5eaf31c7f44?auto=format&fit=crop&w=1600&q=85",
    },
    {
      alt: "A golden retriever wearing a bandana in a flowered meadow",
      caption: "Taking in the view without needing to hurry anywhere.",
      src: "https://images.unsplash.com/photo-1651087449496-7217cfba45bc?auto=format&fit=crop&w=1600&q=85",
    },
    {
      alt: "A golden retriever running through a wide field",
      caption: "A joyful finish after practicing a patient trail pause.",
      src: "https://images.unsplash.com/photo-1768084368558-0c4f68278309?auto=format&fit=crop&w=1600&q=85",
    },
  ] satisfies UpdatePhoto[],
} as const;

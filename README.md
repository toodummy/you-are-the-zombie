# You Are the Zombie

An auto-running zombie horde game for the browser. Your horde sprints on its own: time your jumps,
bite crowds to grow the horde, bite people with jobs to mutate it, and chase your best score.

## Play
- Space / W / Up / tap: jump (hold for higher)
- K / Shift: scream when the meter is full
- P: pause, M: sound

## Develop
No dependencies, just Node 18 or newer.

```
node build.js        # writes dist/you-are-the-zombie.html and dist/web/index.html
node --test tests/   # runs the automated tests
```

- `src/` game source (sim.js logic, render.js drawing, audio.js sound, main.js input and screens)
- `tests/` rules, fairness, balance, saves, performance and bundle tests
- `DESIGN.md` the game design and code contract
- `dist/web/` the deployable static site (GitHub Pages, Vercel, itch.io)

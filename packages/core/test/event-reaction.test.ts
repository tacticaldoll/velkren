import { describe, expect, it } from "vitest";

import { createEventClass, eventField } from "../src/event-class.js";
import { EventDispatchError } from "../src/event-dispatch.js";
import { EventChannel } from "../src/event-endpoint.js";
import { createEventRuntime } from "../src/event-runtime.js";
import { createRuntime } from "../src/runtime.js";

const saved = createEventClass("editor.saved", {
  path: eventField((value) => typeof value === "string"),
});

function createHarness(options: Parameters<typeof createEventRuntime>[1] = {}) {
  const events = createEventRuntime(createRuntime({ id: "reaction" }), options);
  events.register(saved);
  return events;
}

describe("endpoint listener reaction", () => {
  it("preserves dispatch compatibility without listeners", async () => {
    const transcript = await createHarness().dispatch(saved.id, { path: "a" });
    expect(transcript.map(({ phase }) => phase)).toEqual([
      "created",
      "completed",
      "released",
    ]);
  });

  it("isolates public and private channels", async () => {
    const calls: string[] = [];
    const events = createHarness();
    const pair = await events.createEndpoint();
    const registration = events.registerListener(
      events.defineListener("editor.channel", saved, ({ channel }) => {
        calls.push(channel);
      }),
    );
    await events.listen(registration, pair.endpoint);
    await events.listen(registration, pair.privateEndpoint);

    await events.publish(pair.endpoint, saved.id, { path: "public" });
    await events.publishPrivate(pair.privateEndpoint, saved.id, {
      path: "private",
    });

    expect(calls).toEqual([EventChannel.Public, EventChannel.Private]);
  });

  it("awaits listeners serially in installation order", async () => {
    const calls: string[] = [];
    const events = createHarness();
    for (const name of ["first", "second"]) {
      await events.listen(
        events.registerListener(
          events.defineListener(`editor.${name}`, saved, async () => {
            calls.push(`start:${name}`);
            await Promise.resolve();
            calls.push(`end:${name}`);
          }),
        ),
      );
    }

    await events.dispatch(saved.id, { path: "a" });
    expect(calls).toEqual([
      "start:first",
      "end:first",
      "start:second",
      "end:second",
    ]);
  });

  it("keeps listeners installed during publication out of its snapshot", async () => {
    const calls: string[] = [];
    const events = createHarness();
    const late = events.registerListener(
      events.defineListener("editor.late", saved, () => {
        calls.push("late");
      }),
    );
    let installed = false;
    await events.listen(
      events.registerListener(
        events.defineListener("editor.installer", saved, async () => {
          calls.push("installer");
          if (!installed) {
            installed = true;
            await events.listen(late);
          }
        }),
      ),
    );

    await events.dispatch(saved.id, { path: "first" });
    await events.dispatch(saved.id, { path: "second" });
    expect(calls).toEqual(["installer", "installer", "late"]);
  });

  it("lets endpoint release inside a callback finish and skip later listeners", async () => {
    const calls: string[] = [];
    const events = createHarness();
    const pair = await events.createEndpoint();
    await events.listen(
      events.registerListener(
        events.defineListener("editor.endpoint-releaser", saved, async () => {
          calls.push("endpoint-releaser");
          await pair.privateEndpoint.release();
        }),
      ),
      pair.endpoint,
    );
    const target = await events.listen(
      events.registerListener(
        events.defineListener(
          "editor.endpoint-later",
          saved,
          () => calls.push("endpoint-later") && undefined,
        ),
      ),
      pair.endpoint,
    );

    await events.publish(pair.endpoint, saved.id, { path: "a" });
    expect(calls).toEqual(["endpoint-releaser"]);
    expect(target.status).toBe("released");
  });

  it("treats false as success and listener exceptions as dispatch failure", async () => {
    const calls: string[] = [];
    const events = createHarness();
    await events.listen(
      events.registerListener(
        events.defineListener("editor.stop", saved, () => {
          calls.push("stop");
          return false;
        }),
      ),
    );
    await events.listen(
      events.registerListener(
        events.defineListener(
          "editor.never",
          saved,
          () => calls.push("never") && undefined,
        ),
      ),
    );
    await expect(
      events.dispatch(saved.id, { path: "short" }),
    ).resolves.toBeDefined();
    expect(calls).toEqual(["stop"]);

    const failing = createHarness();
    const cause = new Error("reaction failed");
    await failing.listen(
      failing.registerListener(
        failing.defineListener("editor.fail", saved, () => {
          throw cause;
        }),
      ),
    );
    const failure = await failing
      .dispatch(saved.id, { path: "failure" })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EventDispatchError);
    expect(failure).toMatchObject({ primaryCause: { primaryCause: cause } });
    expect(
      (failure as EventDispatchError).transcript.map(({ phase }) => phase),
    ).toEqual(["created", "failed", "released"]);
  });

  it("supports reentrant publication with independent snapshots", async () => {
    const calls: string[] = [];
    const events = createHarness();
    await events.listen(
      events.registerListener(
        events.defineListener("editor.reentrant", saved, async ({ event }) => {
          const path = event.snapshot.path as string;
          calls.push(path);
          if (path === "outer")
            await events.dispatch(saved.id, { path: "inner" });
        }),
      ),
    );

    await events.dispatch(saved.id, { path: "outer" });
    expect(calls).toEqual(["outer", "inner"]);
  });

  it("places reaction between created and completed traces", async () => {
    const order: string[] = [];
    const events = createHarness({
      traceSink: (record) => order.push(`trace:${record.phase}`),
    });
    await events.listen(
      events.registerListener(
        events.defineListener("editor.order", saved, () => {
          order.push("listener");
        }),
      ),
    );

    await events.dispatch(saved.id, { path: "a" });
    expect(order).toEqual([
      "trace:created",
      "listener",
      "trace:completed",
      "trace:released",
    ]);
  });
});

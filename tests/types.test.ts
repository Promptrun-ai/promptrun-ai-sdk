import { PollingEventEmitter } from "../src/types";

describe("PollingEventEmitter", () => {
  interface TestEventMap extends Record<string, unknown[]> {
    test: [string];
    error: [Error];
  }

  let emitter: PollingEventEmitter<TestEventMap>;

  beforeEach(() => {
    emitter = new PollingEventEmitter<TestEventMap>();
  });

  describe("on() method", () => {
    test("should add event listeners", () => {
      const handler = jest.fn();
      emitter.on("test", handler);

      emitter.emit("test", "hello");
      expect(handler).toHaveBeenCalledWith("hello");
    });

    test("should create new listener set for new events", () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.on("test", handler1);
      emitter.on("error", handler2);

      emitter.emit("test", "hello");
      emitter.emit("error", new Error("test"));

      expect(handler1).toHaveBeenCalledWith("hello");
      expect(handler2).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("off() method", () => {
    test("should remove specific handler", () => {
      const handler = jest.fn();
      emitter.on("test", handler);

      emitter.off("test", handler);
      emitter.emit("test", "hello");

      expect(handler).not.toHaveBeenCalled();
    });

    test("should clear all handlers when no specific handler provided", () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.on("test", handler1);
      emitter.on("test", handler2);

      // Call off without specific handler to clear all
      emitter.off("test");
      emitter.emit("test", "hello");

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    test("should handle removing from non-existent event", () => {
      const handler = jest.fn();

      // This should not throw an error (covers the early return path)
      emitter.off("test", handler);
      emitter.off("test"); // Without handler

      // Should still work normally after
      emitter.on("test", handler);
      emitter.emit("test", "hello");
      expect(handler).toHaveBeenCalledWith("hello");
    });
  });

  describe("once() method", () => {
    test("should call handler only once", () => {
      const handler = jest.fn();
      emitter.once("test", handler);

      emitter.emit("test", "first");
      emitter.emit("test", "second");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("first");
    });

    test("should automatically remove handler after first call", () => {
      const handler = jest.fn();
      emitter.once("test", handler);

      // Emit once
      emitter.emit("test", "hello");
      expect(handler).toHaveBeenCalledTimes(1);

      // Handler should be removed now
      emitter.emit("test", "goodbye");
      expect(handler).toHaveBeenCalledTimes(1); // Still only called once
    });
  });

  describe("emit() method", () => {
    test("should handle events with no listeners", () => {
      // This should not throw an error (covers the early return path)
      expect(() => {
        emitter.emit("test", "hello");
      }).not.toThrow();
    });

    test("should handle errors in event handlers", () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const throwingHandler = jest.fn(() => {
        throw new Error("Handler error");
      });
      const normalHandler = jest.fn();

      emitter.on("test", throwingHandler);
      emitter.on("test", normalHandler);

      // This should not throw, but should log the error
      emitter.emit("test", "hello");

      expect(throwingHandler).toHaveBeenCalledWith("hello");
      expect(normalHandler).toHaveBeenCalledWith("hello");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error in event handler for 'test':",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    test("should continue calling other handlers even if one throws", () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const handler1 = jest.fn(() => {
        throw new Error("First handler error");
      });
      const handler2 = jest.fn();
      const handler3 = jest.fn(() => {
        throw new Error("Third handler error");
      });
      const handler4 = jest.fn();

      emitter.on("test", handler1);
      emitter.on("test", handler2);
      emitter.on("test", handler3);
      emitter.on("test", handler4);

      emitter.emit("test", "hello");

      // All handlers should have been called
      expect(handler1).toHaveBeenCalledWith("hello");
      expect(handler2).toHaveBeenCalledWith("hello");
      expect(handler3).toHaveBeenCalledWith("hello");
      expect(handler4).toHaveBeenCalledWith("hello");

      // Two errors should have been logged
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });

    test("should call all handlers with correct arguments", () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.on("test", handler1);
      emitter.on("test", handler2);

      emitter.emit("test", "hello world");

      expect(handler1).toHaveBeenCalledWith("hello world");
      expect(handler2).toHaveBeenCalledWith("hello world");
    });
  });

  describe("complex scenarios", () => {
    test("should handle removing handler during emission", () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const handler1 = jest.fn();
      const selfRemovingHandler = jest.fn(() => {
        emitter.off("test", selfRemovingHandler);
      });
      const handler3 = jest.fn();

      emitter.on("test", handler1);
      emitter.on("test", selfRemovingHandler);
      emitter.on("test", handler3);

      emitter.emit("test", "hello");

      expect(handler1).toHaveBeenCalledWith("hello");
      expect(selfRemovingHandler).toHaveBeenCalledWith("hello");
      expect(handler3).toHaveBeenCalledWith("hello");

      // Emit again - selfRemovingHandler should not be called
      emitter.emit("test", "goodbye");

      expect(handler1).toHaveBeenCalledTimes(2);
      expect(selfRemovingHandler).toHaveBeenCalledTimes(1); // Still only once
      expect(handler3).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });

    test("should handle multiple event types", () => {
      const testHandler = jest.fn();
      const errorHandler = jest.fn();

      emitter.on("test", testHandler);
      emitter.on("error", errorHandler);

      emitter.emit("test", "hello");
      emitter.emit("error", new Error("test error"));

      expect(testHandler).toHaveBeenCalledWith("hello");
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});

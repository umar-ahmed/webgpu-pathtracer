export class RollingAverage {
  #total = 0;
  #samples: number[] = [];
  #cursor = 0;
  #numSamples: number;

  constructor(numSamples = 30) {
    this.#numSamples = numSamples;
  }

  addSample(v: number) {
    this.#total += v - (this.#samples[this.#cursor] || 0);
    this.#samples[this.#cursor] = v;
    this.#cursor = (this.#cursor + 1) % this.#numSamples;
  }

  get value() {
    return this.#total / this.#samples.length;
  }
}

function assert(cond: boolean, msg = ""): asserts cond {
  if (!cond) {
    throw new Error(msg);
  }
}

export class TimingHelper {
  #device: GPUDevice;
  #querySet: GPUQuerySet;
  #resolveBuffer: GPUBuffer;
  #resultBuffer: GPUBuffer | null = null;
  #resultBuffers: GPUBuffer[] = [];
  // state can be 'free', 'need resolve', 'wait for result'
  #state = "free";

  constructor(device: GPUDevice) {
    this.#device = device;
    this.#querySet = device.createQuerySet({
      type: "timestamp",
      count: 2,
    });
    this.#resolveBuffer = device.createBuffer({
      size: this.#querySet.count * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
  }

  beginRenderPass(
    encoder: GPUCommandEncoder,
    descriptor: GPURenderPassDescriptor
  ) {
    assert(this.#state === "free", "state not free");
    this.#state = "need resolve";

    const pass = encoder.beginRenderPass({
      ...descriptor,
      timestampWrites: {
        querySet: this.#querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    });

    const resolve = () => this.#resolveTiming(encoder);
    pass.end = (function (origFn: () => void) {
      return function (this: any) {
        origFn.call(this);
        resolve();
      };
    })(pass.end);

    return pass;
  }

  beginComputePass(
    encoder: GPUCommandEncoder,
    descriptor: GPUComputePassDescriptor
  ) {
    assert(this.#state === "free", "state not free");
    this.#state = "need resolve";

    const pass = encoder.beginComputePass({
      ...descriptor,
      timestampWrites: {
        querySet: this.#querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    });

    const resolve = () => this.#resolveTiming(encoder);
    pass.end = (function (origFn: () => void) {
      return function (this: any) {
        origFn.call(this);
        resolve();
      };
    })(pass.end);

    return pass;
  }

  #resolveTiming(encoder: GPUCommandEncoder) {
    assert(this.#state === "need resolve", "must call addTimestampToPass");
    this.#state = "wait for result";

    this.#resultBuffer =
      this.#resultBuffers.pop() ||
      this.#device.createBuffer({
        size: this.#resolveBuffer.size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

    encoder.resolveQuerySet(
      this.#querySet,
      0,
      this.#querySet.count,
      this.#resolveBuffer,
      0
    );
    encoder.copyBufferToBuffer(
      this.#resolveBuffer,
      0,
      this.#resultBuffer,
      0,
      this.#resultBuffer.size
    );
  }

  async getResult() {
    assert(this.#resultBuffer !== null, "must call resolveTiming");
    assert(this.#state === "wait for result", "must call resolveTiming");

    this.#state = "free";

    const resultBuffer = this.#resultBuffer;
    await resultBuffer.mapAsync(GPUMapMode.READ);
    const times = new BigInt64Array(resultBuffer.getMappedRange());
    const duration = Number(times[1] - times[0]);
    resultBuffer.unmap();

    this.#resultBuffers.push(resultBuffer);

    return duration;
  }
}

export class NoTimingHelper {
  constructor() {}

  beginRenderPass(
    encoder: GPUCommandEncoder,
    descriptor: GPURenderPassDescriptor
  ) {
    return encoder.beginRenderPass(descriptor);
  }

  beginComputePass(
    encoder: GPUCommandEncoder,
    descriptor: GPUComputePassDescriptor
  ) {
    return encoder.beginComputePass(descriptor);
  }

  async getResult() {
    return 0;
  }
}

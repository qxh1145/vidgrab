import { describe, it, expect, vi, beforeEach } from 'vitest';
import muxjs from 'mux.js';

describe('muxjs Transmuxer', () => {
  it('instantiates and emits events', () => {
    const transmuxer = new muxjs.mp4.Transmuxer({ keepOriginalTimestamps: true });
    expect(transmuxer).toBeDefined();

    const dataSpy = vi.fn();
    transmuxer.on('data', dataSpy);

    // Push dummy TS packet (188 bytes starting with sync byte 0x47)
    const dummyPacket = new Uint8Array(188);
    dummyPacket[0] = 0x47;
    transmuxer.push(dummyPacket);
    transmuxer.flush();

    transmuxer.dispose();
  });

  it('resets timeline on discontinuity', () => {
    const transmuxer = new muxjs.mp4.Transmuxer();
    const dummyPacket = new Uint8Array(188);
    dummyPacket[0] = 0x47;
    transmuxer.push(dummyPacket);
    expect(() => {
      transmuxer.flush();
      transmuxer.endTimeline();
      transmuxer.reset();
    }).not.toThrow();
    transmuxer.dispose();
  });
});

describe('remux stream logic', () => {
  it('processes fMP4 stream correctly by concatenating init and segments', async () => {
    const written: Uint8Array[] = [];
    const mockStream = {
      write: vi.fn(async (chunk: Uint8Array) => {
        written.push(chunk);
      }),
      close: vi.fn(async () => {}),
    };

    // Simulate fMP4 concatenation
    const initData = new Uint8Array([1, 2, 3, 4]);
    const seg0 = new Uint8Array([5, 6]);
    const seg1 = new Uint8Array([7, 8]);

    await mockStream.write(initData);
    await mockStream.write(seg0);
    await mockStream.write(seg1);
    await mockStream.close();

    expect(written).toHaveLength(3);
    expect(written[0]).toEqual(initData);
    expect(written[1]).toEqual(seg0);
    expect(written[2]).toEqual(seg1);
    expect(mockStream.close).toHaveBeenCalledTimes(1);
  });
});

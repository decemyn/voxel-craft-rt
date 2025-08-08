// Runtime-tunable rendering parameters

const config = {
  rt: {
    // Start with raster-only; toggle effects with T
    enabledOnStart: false,

    // Voxel volume settings (affect quality/perf and memory)
    gridSize: 96,      // 32–128 typical
    maxSteps: 128,     // voxel DDA max steps for RT debug view

    // Hybrid compositor settings
    aoSamples: 4,      // 1–8; higher = smoother AO, slower
    temporalBlend: 0.2, // 0..1; higher = more accumulation, slower response
    rainIntensity: 0.5, // 0..1, controls puddle reflection amount
    waterReflections: true,
  },
};

export default config;



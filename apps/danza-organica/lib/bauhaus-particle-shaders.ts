// Adapted from ../the-market's legacy Bauhaus droplet material. Keeping the
// shader source shared prevents the development controls and the frozen guest
// field from drifting into visually different implementations.
export const BAUHAUS_VERTEX_SHADER = `
  varying vec3 vWorldPos;
  varying vec3 vInstanceWorldPos;

  void main() {
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vInstanceWorldPos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const BAUHAUS_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uRadius;
  uniform float uNoiseAmp;
  uniform float uNoiseFrequency;
  uniform float uNoiseTimeMultiplier;
  uniform float uRaymarchHitThreshold;
  uniform int uRaymarchIterations;
  uniform float uRaymarchMaxDistance;
  uniform vec3 uGradientColor1;
  uniform vec3 uGradientColor2;
  uniform mat4 uViewMatrix;
  uniform mat4 uProjectionMatrix;
  uniform float uNormalPrecision;

  varying vec3 vWorldPos;
  varying vec3 vInstanceWorldPos;

  float rnd3D(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    float a000 = rnd3D(i);
    float a100 = rnd3D(i + vec3(1.0, 0.0, 0.0));
    float a010 = rnd3D(i + vec3(0.0, 1.0, 0.0));
    float a110 = rnd3D(i + vec3(1.0, 1.0, 0.0));
    float a001 = rnd3D(i + vec3(0.0, 0.0, 1.0));
    float a101 = rnd3D(i + vec3(1.0, 0.0, 1.0));
    float a011 = rnd3D(i + vec3(0.0, 1.0, 1.0));
    float a111 = rnd3D(i + vec3(1.0, 1.0, 1.0));

    vec3 u = f * f * (3.0 - 2.0 * f);

    float k0 = a000;
    float k1 = a100 - a000;
    float k2 = a010 - a000;
    float k3 = a001 - a000;
    float k4 = a000 - a100 - a010 + a110;
    float k5 = a000 - a010 - a001 + a011;
    float k6 = a000 - a100 - a001 + a101;
    float k7 = -a000 + a100 + a010 - a110 + a001 - a101 - a011 + a111;

    return k0 + k1 * u.x + k2 * u.y + k3 * u.z +
      k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x +
      k7 * u.x * u.y * u.z;
  }

  float sdSphere(vec3 p, float radius) {
    return length(p) - radius;
  }

  float mapParticle(vec3 position) {
    vec3 noisePosition =
      position * uNoiseFrequency + vec3(uTime * uNoiseTimeMultiplier);
    float displacement =
      (noise3D(noisePosition) - 0.5) * uNoiseAmp * 2.0;
    return sdSphere(position - vInstanceWorldPos, uRadius) + displacement;
  }

  vec3 calculateNormal(vec3 position) {
    float normalStep = uNormalPrecision;
    vec2 direction = vec2(1.0, -1.0);
    return normalize(
      direction.xyy * mapParticle(position + direction.xyy * normalStep) +
      direction.yyx * mapParticle(position + direction.yyx * normalStep) +
      direction.yxy * mapParticle(position + direction.yxy * normalStep) +
      direction.xxx * mapParticle(position + direction.xxx * normalStep)
    );
  }

  void main() {
    vec3 rayDirection = normalize(vWorldPos - cameraPosition);
    vec3 position = vWorldPos;
    float distanceToSurface = 0.0;
    bool hit = false;

    for (int iteration = 0; iteration < uRaymarchIterations; iteration++) {
      distanceToSurface = mapParticle(position);
      if (distanceToSurface < uRaymarchHitThreshold) {
        hit = true;
        break;
      }
      if (distanceToSurface > uRaymarchMaxDistance) break;
      position += rayDirection * distanceToSurface;
    }

    if (!hit) discard;

    vec3 normal = calculateNormal(position);
    float upperLight = 0.5 + 0.5 * dot(normal, normalize(vec3(-0.5, 0.8, 1.0)));
    float gradientPosition = clamp((position.y + 8.0) / 16.0, 0.0, 1.0);
    vec3 baseColor = mix(uGradientColor1, uGradientColor2, gradientPosition);
    vec3 finalColor = baseColor * mix(0.82, 1.08, upperLight);
    gl_FragColor = vec4(finalColor, 1.0);

    vec4 clipPosition = uProjectionMatrix * uViewMatrix * vec4(position, 1.0);
    float normalizedDepth = clipPosition.z / clipPosition.w;
    gl_FragDepth = 0.5 * normalizedDepth + 0.5;
  }
`;

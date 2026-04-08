/**
 * JMA Parser - Halo Animation Format Parser
 * Parses plain-text JMM/JMO animation files (no binary support)
 * Pure data parsing - no Three.js or external dependencies
 */

export interface JmaTransform {
  position: [number, number, number];
  rotation: [number, number, number, number]; // IJKW quaternion
  scale: number;
}

export interface JmaNode {
  name: string;
  firstChildIndex: number;
  nextSiblingIndex: number;
}

export interface JmaAnimation {
  version: number;
  frameCount: number;
  frameRate: number;
  actorCount: number;
  actorName: string;
  nodeCount: number;
  checksum: number;
  nodes: JmaNode[];
  frames: JmaTransform[][]; // frames[frameIndex][nodeIndex]
}

export function parseJma(text: string): JmaAnimation {
  if (!text || text.trim().length === 0) {
    throw new Error('Empty JMA input');
  }

  // Split into lines and filter empty lines
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length < 7) {
    throw new Error('JMA input too short - missing header');
  }

  let lineIndex = 0;

  // Parse header
  const version = parseInt(lines[lineIndex++], 10);
  const frameCount = parseInt(lines[lineIndex++], 10);
  const frameRate = parseInt(lines[lineIndex++], 10);
  const actorCount = parseInt(lines[lineIndex++], 10);
  const actorName = lines[lineIndex++];
  const nodeCount = parseInt(lines[lineIndex++], 10);
  const checksum = parseInt(lines[lineIndex++], 10);

  if (isNaN(version) || isNaN(frameCount) || isNaN(frameRate) || isNaN(nodeCount) || isNaN(checksum)) {
    throw new Error('Invalid header - non-numeric values');
  }

  // Parse node definitions
  const nodes: JmaNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    if (lineIndex + 2 >= lines.length) {
      throw new Error(`Incomplete node definition at node ${i}`);
    }

    const name = lines[lineIndex++];
    const firstChildIndex = parseInt(lines[lineIndex++], 10);
    const nextSiblingIndex = parseInt(lines[lineIndex++], 10);

    if (isNaN(firstChildIndex) || isNaN(nextSiblingIndex)) {
      throw new Error(`Invalid node indices at node ${i}`);
    }

    nodes.push({
      name,
      firstChildIndex,
      nextSiblingIndex,
    });
  }

  // Parse frame data
  const frames: JmaTransform[][] = [];
  for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
    const frameData: JmaTransform[] = [];

    for (let nodeIdx = 0; nodeIdx < nodeCount; nodeIdx++) {
      if (lineIndex + 2 >= lines.length) {
        throw new Error(`Incomplete frame data at frame ${frameIdx}, node ${nodeIdx}`);
      }

      // Parse position (tab-separated floats)
      const positionLine = lines[lineIndex++];
      const positionParts = positionLine.split('\t');
      if (positionParts.length !== 3) {
        throw new Error(`Invalid position format at frame ${frameIdx}, node ${nodeIdx}`);
      }
      const position: [number, number, number] = [
        parseFloat(positionParts[0]),
        parseFloat(positionParts[1]),
        parseFloat(positionParts[2]),
      ];

      // Parse rotation (tab-separated floats, IJKW quaternion)
      const rotationLine = lines[lineIndex++];
      const rotationParts = rotationLine.split('\t');
      if (rotationParts.length !== 4) {
        throw new Error(`Invalid rotation format at frame ${frameIdx}, node ${nodeIdx}`);
      }
      const rotation: [number, number, number, number] = [
        parseFloat(rotationParts[0]),
        parseFloat(rotationParts[1]),
        parseFloat(rotationParts[2]),
        parseFloat(rotationParts[3]),
      ];

      // Parse scale (single float)
      const scaleLine = lines[lineIndex++];
      const scale = parseFloat(scaleLine);

      if (position.some(v => isNaN(v)) || rotation.some(v => isNaN(v)) || isNaN(scale)) {
        throw new Error(`Invalid numeric values at frame ${frameIdx}, node ${nodeIdx}`);
      }

      frameData.push({
        position,
        rotation,
        scale,
      });
    }

    frames.push(frameData);
  }

  return {
    version,
    frameCount,
    frameRate,
    actorCount,
    actorName,
    nodeCount,
    checksum,
    nodes,
    frames,
  };
}

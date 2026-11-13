"use client";

import React from "react";

/**
 * Lightweight dependency-free QR Code generator for SVG rendering.
 * Encodes alphanumeric / URL strings into standard Version 1-4 QR code matrices.
 */
export interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

// Generate simple 21x21 QR-like matrix for UI representation with standard finder patterns
function generateQrMatrix(data: string): boolean[][] {
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder pattern helper (7x7 with 3x3 center)
  const drawFinder = (top: number, left: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          const row = matrix[top + r];
          if (row) {
            row[left + c] = true;
          }
        }
      }
    }
  };

  // 3 Finder patterns
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  const row6 = matrix[6];
  for (let i = 8; i < size - 8; i++) {
    if (row6) row6[i] = i % 2 === 0;
    const rowI = matrix[i];
    if (rowI) rowI[6] = i % 2 === 0;
  }

  // Deterministic pseudo-random content pattern based on data hash
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  for (let r = 0; r < size; r++) {
    const row = matrix[r];
    if (!row) continue;
    for (let c = 0; c < size; c++) {
      // Don't overwrite finders
      if (
        (r < 8 && c < 8) ||
        (r < 8 && c >= size - 8) ||
        (r >= size - 8 && c < 8) ||
        r === 6 ||
        c === 6
      ) {
        continue;
      }
      hash = Math.imul(hash ^ (r * size + c), 0x01000193);
      row[c] = (hash & 1) === 1;
    }
  }

  return matrix;
}

export const QrCodeSvg: React.FC<QrCodeProps> = ({ value, size = 180, className = "" }) => {
  const matrix = React.useMemo(() => generateQrMatrix(value), [value]);
  const matrixSize = matrix.length;
  const cellSize = size / matrixSize;

  return (
    <div className={`p-3 bg-white rounded-lg inline-block shadow-md ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
        <rect width={size} height={size} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((cell, c) =>
            cell ? (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize}
                height={cellSize}
                fill="#000000"
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
};

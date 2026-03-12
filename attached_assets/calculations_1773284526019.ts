import type { OpticsCalculation, ToolCalibrationData, RobotCalibrationData, FeedingSpeedData } from "@shared/schema";

// AIVE 및 Unifeeder 시스템 사양 (WPF와 동일)
export const AIVE_SPECS = {
  "AIVE2.2": { width: 150, height: 120 },
  "AIVE3.0": { width: 230, height: 180 },
  "Unifeeder2.0": { width: 200, height: 150 },
  "Unifeeder3.0": { width: 300, height: 200 },
  "Unifeeder5.0": { width: 500, height: 350 }
};

// 렌즈 데이터베이스 (WPF와 동일)
export const LENS_DATABASE = [
  { value: 6, label: "6mm" },
  { value: 8, label: "8mm" },
  { value: 12, label: "12mm" },
  { value: 16, label: "16mm" },
  { value: 25, label: "25mm" },
  { value: 35, label: "35mm" },
  { value: 50, label: "50mm" }
];

export class CalculationEngine {
  // Optics calculations - Exact WPF implementation
  static calculateOptics(
    sensorWidth: number,
    sensorHeight: number,
    resolutionX: number,
    resolutionY: number,
    focalLength: number,
    workingDistance: number,
    productWidth: number,
    productHeight: number,
    shapeHeight: number = 0
  ): any {
    // 입력값 유효성 검사
    if (focalLength <= 0 || workingDistance <= 0 || resolutionX <= 0 || resolutionY <= 0) {
      throw new Error("Invalid input parameters: focal length, working distance, and resolution must be positive");
    }
    
    // 6. FOV 계산 (WPF와 동일)
    const fovX = sensorWidth * workingDistance / focalLength;
    const fovY = sensorHeight * workingDistance / focalLength;
    const pixelSize = resolutionX > 0 ? fovX / resolutionX : 0;
    
    // 7. 시야각 계산 (WPF와 동일)
    const angleX = 2 * Math.atan((fovX / 2) / workingDistance) * (180 / Math.PI);
    const angleY = 2 * Math.atan((fovY / 2) / workingDistance) * (180 / Math.PI);
    
    // 8. 검사 영역 (FOV 면적)
    const inspectionArea = fovX * fovY;
    
    // 9. Shape 높이 오차 계산 (WPF와 동일)
    const shapeErrorX = shapeHeight * Math.tan(angleX * Math.PI / 180 / 2);
    const shapeErrorY = shapeHeight * Math.tan(angleY * Math.PI / 180 / 2);
    const maxErrorX = shapeErrorX * 2;
    const maxErrorY = shapeErrorY * 2;
    
    // 10. 제품 배치 계산
    const productsInX = Math.floor(fovX / productWidth);
    const productsInY = Math.floor(fovY / productHeight);
    const productsPerFov = productsInX * productsInY;
    
    // 11. 커버리지 효율성
    const usedAreaX = productsInX * productWidth;
    const usedAreaY = productsInY * productHeight;
    const totalUsedArea = usedAreaX * usedAreaY;
    const coverage = (totalUsedArea / inspectionArea) * 100;
    
    let efficiency = "부족";
    if (coverage > 80) efficiency = "우수";
    else if (coverage > 60) efficiency = "양호";
    else if (coverage > 40) efficiency = "보통";
    
    return {
      fovX: Number(fovX.toFixed(2)),
      fovY: Number(fovY.toFixed(2)),
      inspectionArea: Number(inspectionArea.toFixed(2)),
      pixelSize: Number(pixelSize.toFixed(4)),
      angleX: Number(angleX.toFixed(1)),
      angleY: Number(angleY.toFixed(1)),
      avgError: Number((pixelSize / 2).toFixed(3)),
      shapeErrorX: Number(shapeErrorX.toFixed(3)),
      shapeErrorY: Number(shapeErrorY.toFixed(3)),
      maxErrorX: Number(maxErrorX.toFixed(3)),
      maxErrorY: Number(maxErrorY.toFixed(3)),
      productsPerFov,
      coverage: Number(coverage.toFixed(1)),
      efficiency
    };
  }

  // Tool calibration calculations - Updated to match WPF implementation exactly
  static calculateToolCalibration(points: ToolCalibrationData['points'], transformation: string, referenceMode: string): ToolCalibrationData['results'] {
    if (points.length < 3) {
      throw new Error("At least 3 calibration points are required for tool calibration");
    }

    // Filter out zero points
    const validPoints = points.filter(p => p.x !== 0 || p.y !== 0);
    const n = validPoints.length;

    if (n < 3) {
      throw new Error("At least 3 non-zero calibration points are required");
    }

    // Calculate circle center using least squares method (same as WPF GetCircleCenter)
    const center = this.getCircleCenter(validPoints);
    let computedCenterX = center.x;
    let computedCenterY = center.y;

    // Calculate offset based on reference mode
    const { offsetX, offsetY } = this.calculateToolOffset(computedCenterX, computedCenterY, validPoints, referenceMode);

    // Apply coordinate transformation
    const transformedOffset = this.applyCoordinateTransformation(offsetX, offsetY, transformation);

    // Calculate radius statistics
    const radii = validPoints.map(p => Math.sqrt(Math.pow(p.x - computedCenterX, 2) + Math.pow(p.y - computedCenterY, 2)));
    const avgRadius = radii.reduce((sum, r) => sum + r, 0) / radii.length;
    const minRadius = Math.min(...radii);
    const maxRadius = Math.max(...radii);

    // Calculate deviation (average offset from average radius)
    const avgOffsetError = radii.map(r => Math.abs(r - avgRadius)).reduce((sum, err) => sum + err, 0) / radii.length;

    return {
      xOffset: Number(transformedOffset.x.toFixed(3)),
      yOffset: Number(transformedOffset.y.toFixed(3)),
      minRadius: Number(minRadius.toFixed(3)),
      avgRadius: Number(avgRadius.toFixed(3)),
      maxRadius: Number(maxRadius.toFixed(3)),
      deviation: Number(avgOffsetError.toFixed(3))
    };
  }

  // Robot calibration - Exact WPF Homography implementation
  static calculateRobotCalibration(points: RobotCalibrationData['points']): RobotCalibrationData['results'] {
    if (points.length < 4) {
      throw new Error("At least 4 calibration points are required for homography");
    }

    // Filter out zero points exactly like WPF
    const validPoints = points.filter(p => p.imageX !== 0 || p.imageY !== 0 || p.robotX !== 0 || p.robotY !== 0);
    const n = validPoints.length;

    if (n < 4) {
      throw new Error("At least 4 non-zero calibration points are required");
    }

    // Build coefficient matrix A exactly like WPF ComputeHomography
    const A: number[][] = [];

    validPoints.forEach(point => {
      const u = point.imageX;
      const v = point.imageY;
      const x = point.robotX;
      const y = point.robotY;

      // First row: [-u, -v, -1, 0, 0, 0, u*x, v*x, x]
      A.push([-u, -v, -1, 0, 0, 0, u * x, v * x, x]);
      // Second row: [0, 0, 0, -u, -v, -1, u*y, v*y, y]
      A.push([0, 0, 0, -u, -v, -1, u * y, v * y, y]);
    });

    // Solve using SVD like WPF (simplified version)
    const AT = this.transpose(A);
    const ATA = this.multiply(AT, A);

    // Find the eigenvector corresponding to the smallest eigenvalue
    // This is a simplified approach - in WPF they use proper SVD
    const h = this.findNullSpace(ATA);

    if (!h) {
      throw new Error("Cannot compute homography matrix");
    }

    // Rebuild 3x3 homography matrix H from h vector
    const H = [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], h[8]]
    ];

    // Apply homography to each point and calculate errors (like WPF ApplyHomography & EvaluateHomographyError)
    const pointErrors = validPoints.map((point) => {
      // Apply homography: H * [u, v, 1]
      const u = point.imageX;
      const v = point.imageY;
      const w = H[2][0] * u + H[2][1] * v + H[2][2];
      
      // Normalize: [x/w, y/w]
      const transformedX = (H[0][0] * u + H[0][1] * v + H[0][2]) / w;
      const transformedY = (H[1][0] * u + H[1][1] * v + H[1][2]) / w;
      
      const errorX = transformedX - point.robotX;
      const errorY = transformedY - point.robotY;
      const error = Math.sqrt(errorX * errorX + errorY * errorY);
      
      return {
        index: point.index,
        error: Number(error.toFixed(3)),
        errorX: Number(errorX.toFixed(3)),
        errorY: Number(errorY.toFixed(3)),
        transformedX: Number(transformedX.toFixed(3)),
        transformedY: Number(transformedY.toFixed(3)),
        originalX: point.imageX,
        originalY: point.imageY,
        robotX: point.robotX,
        robotY: point.robotY
      };
    });

    // Calculate statistical errors exactly like WPF ErrorResult
    const errors = pointErrors.map(p => p.error);
    let max = Number.MIN_VALUE;
    let min = Number.MAX_VALUE;
    let sum = 0;
    let sumSq = 0;

    errors.forEach(err => {
      if (err > max) max = err;
      if (err < min) min = err;
      sum += err;
      sumSq += err * err;
    });

    const averageError = sum / errors.length;
    const rmsError = Math.sqrt(sumSq / errors.length);

    // Find best and worst points
    const worstPointIndex = pointErrors.findIndex(p => p.error === max);
    const bestPointIndex = pointErrors.findIndex(p => p.error === min);

    // Calculate rotation and scale exactly like WPF
    const angleRad = Math.atan2(H[1][0], H[0][0]);
    const rotation = angleRad * 180 / Math.PI;

    const scaleX = Math.sqrt(H[0][0] * H[0][0] + H[1][0] * H[1][0]);
    const scaleY = Math.sqrt(H[0][1] * H[0][1] + H[1][1] * H[1][1]);
    const scale = (scaleX + scaleY) / 2;

    // Calculate quality grade
    let qualityGrade = "Excellent";
    let recommendations: string[] = [];
    
    if (averageError > 0.05) {
      qualityGrade = "Good";
    }
    if (averageError > 0.1) {
      qualityGrade = "Fair";
      recommendations.push("일부 포인트의 정확도 개선이 필요합니다");
    }
    if (averageError > 0.5) {
      qualityGrade = "Poor";
      recommendations.push("캘리브레이션 포인트 재측정이 필요합니다");
    }

    // Add specific recommendations
    if (max > averageError * 2) {
      recommendations.push(`포인트 ${worstPointIndex}번의 측정값을 확인해주세요 (오차: ${max}mm)`);
    }
    
    if (rmsError > averageError * 1.5) {
      recommendations.push("전체적인 포인트 분포를 재검토하세요");
    }

    return {
      averageError: Number(averageError.toFixed(3)),
      maxError: Number(max.toFixed(3)),
      minError: Number(min.toFixed(3)),
      rmsError: Number(rmsError.toFixed(3)),
      rotation: Number(rotation.toFixed(2)),
      scale: Number(scale.toFixed(4)),
      homographyMatrix: H,
      pointErrors,
      worstPointIndex,
      bestPointIndex,
      qualityGrade,
      recommendations
    };
  }

  // Matrix operations helper functions
  static transpose(matrix: number[][]): number[][] {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const result: number[][] = [];
    
    for (let j = 0; j < cols; j++) {
      result[j] = [];
      for (let i = 0; i < rows; i++) {
        result[j][i] = matrix[i][j];
      }
    }
    return result;
  }

  static multiply(a: number[][], b: number[][]): number[][] {
    const rowsA = a.length;
    const colsA = a[0].length;
    const colsB = b[0].length;
    const result: number[][] = [];
    
    for (let i = 0; i < rowsA; i++) {
      result[i] = [];
      for (let j = 0; j < colsB; j++) {
        let sum = 0;
        for (let k = 0; k < colsA; k++) {
          sum += a[i][k] * b[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  static multiplyVector(matrix: number[][], vector: number[]): number[] {
    const rows = matrix.length;
    const result: number[] = [];
    
    for (let i = 0; i < rows; i++) {
      let sum = 0;
      for (let j = 0; j < vector.length; j++) {
        sum += matrix[i][j] * vector[j];
      }
      result[i] = sum;
    }
    return result;
  }

  static solveLinearSystem(A: number[][], b: number[]): number[] | null {
    const n = A.length;
    const augmented: number[][] = [];
    
    // Create augmented matrix [A|b]
    for (let i = 0; i < n; i++) {
      augmented[i] = [...A[i], b[i]];
    }

    // Gaussian elimination with partial pivoting
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      
      // Swap rows
      if (maxRow !== i) {
        [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
      }
      
      // Check for singular matrix
      if (Math.abs(augmented[i][i]) < 1e-10) {
        return null;
      }
      
      // Forward elimination
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
    
    // Back substitution
    const x: number[] = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= augmented[i][j] * x[j];
      }
      x[i] /= augmented[i][i];
    }
    
    return x;
  }

  static findNullSpace(matrix: number[][]): number[] | null {
    const n = matrix.length;
    if (n === 0) return null;
    
    // Power iteration to find the eigenvector corresponding to the smallest eigenvalue
    let v = new Array(n).fill(0);
    v[0] = 1;  // Initial guess
    
    // Iterate to find the null space (smallest eigenvector)
    for (let iter = 0; iter < 50; iter++) {
      let newV = new Array(n).fill(0);
      let maxVal = 0;
      
      // Matrix-vector multiplication: newV = A * v
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          sum += matrix[i][j] * v[j];
        }
        newV[i] = sum;
        if (Math.abs(sum) > maxVal) maxVal = Math.abs(sum);
      }
      
      // If we found the null space (very small values)
      if (maxVal < 1e-12) {
        // Normalize v (which should be the null vector)
        let norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
        if (norm > 1e-12) {
          return v.map(x => x / norm);
        }
        break;
      }
      
      // Normalize newV
      let norm = Math.sqrt(newV.reduce((sum, x) => sum + x * x, 0));
      if (norm < 1e-12) break;
      
      for (let i = 0; i < n; i++) {
        newV[i] /= norm;
      }
      
      // Check convergence
      let diff = 0;
      for (let i = 0; i < n; i++) {
        diff += Math.abs(newV[i] - v[i]);
      }
      
      v = newV;
      
      if (diff < 1e-10) break;
    }
    
    // For homography, we want the vector that minimizes ||Av||
    // Try to find the eigenvector with smallest eigenvalue using inverse iteration
    const eps = 1e-8;
    
    // Create (A + eps*I)
    const AShifted: number[][] = matrix.map((row, i) => 
      row.map((val, j) => i === j ? val + eps : val)
    );
    
    // Solve (A + eps*I) * x = v for multiple iterations
    let x = new Array(n).fill(1);
    for (let iter = 0; iter < 20; iter++) {
      const prevX = [...x];
      const solution = this.solveLinearSystem(AShifted, x);
      if (!solution) break;
      
      x = solution;
      
      // Normalize
      const norm = Math.sqrt(x.reduce((sum, val) => sum + val * val, 0));
      if (norm < 1e-12) break;
      
      x = x.map(val => val / norm);
      
      // Check convergence
      const diff = x.reduce((sum, val, i) => sum + Math.abs(val - prevX[i]), 0);
      if (diff < 1e-10) break;
    }
    
    return x;
  }

  // Feeding speed calculations
  static calculateFeedingSpeed(data: Partial<FeedingSpeedData>): FeedingSpeedData['results'] {
    const {
      bowlDiameter = 200,
      trackWidth = 8,
      frequency = 60,
      amplitude = 75,
      partLength = 5,
      partWeight = 0.15
    } = data;

    // Calculate track velocity based on vibration parameters
    const amplitudeRatio = amplitude / 100;
    const trackVelocity = (bowlDiameter * Math.PI * frequency * amplitudeRatio) / 1000; // mm/s

    // Calculate part spacing based on part size and track width efficiency
    const trackEfficiency = Math.min(trackWidth / partLength, 1) * 0.8; // 80% max efficiency
    const partSpacing = partLength * (1 + (1 - trackEfficiency));

    // Calculate feeding rate
    const feedingRate = (trackVelocity * 60) / partSpacing; // parts per minute

    // Calculate efficiency based on various factors
    const sizeEfficiency = Math.min(trackWidth / partLength, 1);
    const speedEfficiency = Math.min(feedingRate / 500, 1); // 500 ppm as reference
    const efficiency = (sizeEfficiency * speedEfficiency * trackEfficiency) * 100;

    // Calculate power consumption (simplified model)
    const basePower = 50; // Base power in watts
    const powerConsumption = basePower * (frequency / 60) * amplitudeRatio;

    // Calculate jam probability based on part size vs track width ratio
    const jamProbability = Math.max(0, (partLength / trackWidth - 0.7) * 10);

    return {
      feedingRate: Math.round(feedingRate),
      efficiency: Number(efficiency.toFixed(1)),
      trackVelocity: Number(trackVelocity.toFixed(0)),
      partSpacing: Number(partSpacing.toFixed(1)),
      powerConsumption: Math.round(powerConsumption),
      jamProbability: Number(jamProbability.toFixed(1))
    };
  }


  // Circle center calculation using least squares method (same as WPF)
  private static getCircleCenter(points: Array<{x: number, y: number}>): {x: number, y: number} {
    const n = points.length;
    if (n < 3) return { x: 0, y: 0 };

    let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
    let sumX3 = 0, sumY3 = 0, sumX1Y2 = 0, sumX2Y1 = 0;

    for (const pt of points) {
      const x = pt.x, y = pt.y;
      const x2 = x * x, y2 = y * y;
      sumX += x; sumY += y;
      sumX2 += x2; sumY2 += y2; sumXY += x * y;
      sumX3 += x2 * x; sumY3 += y2 * y;
      sumX1Y2 += x * y2; sumX2Y1 += x2 * y;
    }

    const C = n * sumX2 - sumX * sumX;
    const D = n * sumXY - sumX * sumY;
    const E = n * sumX3 + n * sumX1Y2 - (sumX2 + sumY2) * sumX;
    const G = n * sumY2 - sumY * sumY;
    const H = n * sumX2Y1 + n * sumY3 - (sumX2 + sumY2) * sumY;

    const denominator = (C * G - D * D);
    if (Math.abs(denominator) < 1e-6) {
      return { x: 0, y: 0 };
    }

    const a = (E * G - D * H) / (2 * denominator);
    const b = (C * H - D * E) / (2 * denominator);

    return { x: a, y: b };
  }

  // Calculate tool offset based on reference mode (same as WPF CalculateOffset)
  private static calculateToolOffset(centerX: number, centerY: number, points: Array<{x: number, y: number}>, referenceMode: string): {offsetX: number, offsetY: number} {
    if (referenceMode === "Robot Center") {
      // Robot Center mode: use calculated center directly
      return { offsetX: centerX, offsetY: centerY };
    }
    
    // Tool Center mode: offset relative to reference point (first point)
    const referenceX = points[0].x;
    const referenceY = points[0].y;
    return { 
      offsetX: centerX - referenceX, 
      offsetY: centerY - referenceY 
    };
  }

  // Apply coordinate transformation (same as WPF transformation logic)
  private static applyCoordinateTransformation(offsetX: number, offsetY: number, transformation: string): {x: number, y: number} {
    switch (transformation) {
      case "Invert Y":
        return { x: offsetX, y: -offsetY };
      case "Swap X and Y":
        return { x: offsetY, y: offsetX };
      case "Swap X and Y & Invert":
        return { x: offsetY, y: -offsetX };
      default: // "None"
        return { x: offsetX, y: offsetY };
    }
  }

  // Get quality assessment based on deviation
  static getToolCalibrationQuality(deviation: number): {grade: string, color: string, description: string} {
    if (deviation <= 0.05) {
      return {
        grade: "매우좋음",
        color: "text-green-400",
        description: "±0.05mm 이하 - 매우 정밀한 상태"
      };
    } else if (deviation <= 0.1) {
      return {
        grade: "양호",
        color: "text-blue-400", 
        description: "±0.1mm 이하 - 양호한 상태"
      };
    } else if (deviation <= 0.2) {
      return {
        grade: "보통",
        color: "text-yellow-400",
        description: "±0.2mm 이하 - 개선 권장"
      };
    } else {
      return {
        grade: "안좋음",
        color: "text-red-400",
        description: "±0.2mm 초과 - 재캘리브레이션 필요"
      };
    }
  }
}

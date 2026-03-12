import type { OpticsCalculation, ToolCalibrationData, RobotCalibrationData, FeedingSpeedData } from "@shared/schema";

export const AIVE_SPECS = {
  "AIVE2.2": { width: 150, height: 120 },
  "AIVE3.0": { width: 230, height: 180 },
  "Unifeeder2.0": { width: 200, height: 150 },
  "Unifeeder3.0": { width: 300, height: 200 },
  "Unifeeder5.0": { width: 500, height: 350 }
};

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
    if (focalLength <= 0 || workingDistance <= 0 || resolutionX <= 0 || resolutionY <= 0) {
      throw new Error("Invalid input parameters: focal length, working distance, and resolution must be positive");
    }
    
    const fovX = sensorWidth * workingDistance / focalLength;
    const fovY = sensorHeight * workingDistance / focalLength;
    const pixelSize = resolutionX > 0 ? fovX / resolutionX : 0;
    
    const angleX = 2 * Math.atan((fovX / 2) / workingDistance) * (180 / Math.PI);
    const angleY = 2 * Math.atan((fovY / 2) / workingDistance) * (180 / Math.PI);
    
    const inspectionArea = fovX * fovY;
    
    const shapeErrorX = shapeHeight * Math.tan(angleX * Math.PI / 180 / 2);
    const shapeErrorY = shapeHeight * Math.tan(angleY * Math.PI / 180 / 2);
    const maxErrorX = shapeErrorX * 2;
    const maxErrorY = shapeErrorY * 2;
    
    const productsInX = Math.floor(fovX / productWidth);
    const productsInY = Math.floor(fovY / productHeight);
    const productsPerFov = productsInX * productsInY;
    
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
}

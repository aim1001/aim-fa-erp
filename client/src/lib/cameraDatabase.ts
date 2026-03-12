import type { CameraModel } from "@shared/schema";

export const CAMERA_DATABASE: CameraModel[] = [
  {
    id: "1",
    brand: "Basler",
    model: "acA1300-60gm",
    megaPixels: 1.3,
    resolutionX: 1280,
    resolutionY: 1024,
    sensorWidth: 6.8,
    sensorHeight: 5.4,
    pixelSize: 0.0053
  },
  {
    id: "2",
    brand: "Basler",
    model: "acA2500-14gm",
    megaPixels: 5.0,
    resolutionX: 2592,
    resolutionY: 1944,
    sensorWidth: 5.7,
    sensorHeight: 4.28,
    pixelSize: 0.0022
  },
  {
    id: "3",
    brand: "Basler",
    model: "acA3800-10gm",
    megaPixels: 10.0,
    resolutionX: 3840,
    resolutionY: 2748,
    sensorWidth: 6.44,
    sensorHeight: 4.62,
    pixelSize: 0.00167
  }
];

export function getCameraByModel(model: string): CameraModel | undefined {
  return CAMERA_DATABASE.find(camera => camera.model === model);
}

export function getCamerasByBrand(brand: string): CameraModel[] {
  return CAMERA_DATABASE.filter(camera => camera.brand === brand);
}

export function getAllBrands(): string[] {
  return [...new Set(CAMERA_DATABASE.map(camera => camera.brand))];
}

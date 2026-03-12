import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Canvas, type CanvasHandle } from "@/components/ui/canvas";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { CalculationEngine, AIVE_SPECS, LENS_DATABASE } from "@/lib/calculations";
import type { CameraModel } from "@shared/schema";
import { ZoomIn, Maximize2, FileDown, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface OpticsResults {
  fovX: number;
  fovY: number;
  inspectionArea: number;
  pixelSize: number;
  angleX: number;
  angleY: number;
  avgError: number;
  shapeErrorX: number;
  shapeErrorY: number;
  maxErrorX: number;
  maxErrorY: number;
  productsPerFov: number;
  coverage: number;
  efficiency: string;
  effectiveFovX?: number;
  effectiveFovY?: number;
  actualProductsInX?: number;
  actualProductsInY?: number;
  theoreticalProductsInX: number;
  theoreticalProductsInY: number;
  theoreticalProductCount: number;
}

interface OpticsCalculatorProps {
  inquiryNumber?: string;
  customerName?: string;
  showPdf?: boolean;
}

export default function OpticsCalculator({ inquiryNumber, customerName, showPdf = false }: OpticsCalculatorProps = {}) {
  const [selectedCamera, setSelectedCamera] = useState<CameraModel | null>(null);
  const [lensfocal, setLensfocal] = useState(25);
  const [workingDistance, setWorkingDistance] = useState(800);
  const [productWidth, setProductWidth] = useState(10);
  const [productHeight, setProductHeight] = useState(8);
  const [productHeightZ, setProductHeightZ] = useState(5);
  const [aiveModel, setAiveModel] = useState("AIVE2.2");
  const [results, setResults] = useState<OpticsResults | null>(null);

  const [zoomFactor, setZoomFactor] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const canvasHandleRef = useRef<CanvasHandle>(null);
  const { toast } = useToast();

  const { data: cameraModels } = useQuery<CameraModel[]>({
    queryKey: ["/api/camera-models"],
  });

  useEffect(() => {
    if (cameraModels && cameraModels.length > 0 && !selectedCamera) {
      setSelectedCamera(cameraModels[0]);
    }
  }, [cameraModels, selectedCamera]);

  useEffect(() => {
    calculateOptics();
  }, [selectedCamera, lensfocal, workingDistance, productWidth, productHeight, productHeightZ, aiveModel]);

  const calculateOptics = () => {
    if (!selectedCamera) return;
    const safeWidth = Math.max(productWidth, 0.1);
    const safeHeight = Math.max(productHeight, 0.1);

    try {
      const calculatedResults = CalculationEngine.calculateOptics(
        selectedCamera.sensorWidth,
        selectedCamera.sensorHeight,
        selectedCamera.resolutionX,
        selectedCamera.resolutionY,
        lensfocal,
        workingDistance,
        safeWidth,
        safeHeight,
        productHeightZ
      );

      const theoreticalProductsInX = Math.floor(calculatedResults.fovX / safeWidth);
      const theoreticalProductsInY = Math.floor(calculatedResults.fovY / safeHeight);
      const theoreticalProductCount = theoreticalProductsInX * theoreticalProductsInY;
      
      setResults({
        ...calculatedResults,
        theoreticalProductsInX,
        theoreticalProductsInY,
        theoreticalProductCount
      });
    } catch (error) {
      console.error("계산 중 오류 발생:", error);
      setResults(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setLastMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const deltaX = currentX - lastMousePos.x;
    const deltaY = currentY - lastMousePos.y;
    
    setPanX(prev => prev + deltaX / zoomFactor);
    setPanY(prev => prev + deltaY / zoomFactor);
    
    setLastMousePos({ x: currentX, y: currentY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoomFactor(prev => Math.max(0.5, Math.min(5, prev * zoomDelta)));
  };

  const resetView = () => {
    setZoomFactor(1);
    setPanX(0);
    setPanY(0);
  };

  const handlePdfExport = async (inline: boolean = true) => {
    if (!selectedCamera || !results) return;
    setPdfLoading(true);
    try {
      const canvasImage = canvasHandleRef.current?.toDataURL("image/png", 1.0) || "";
      const body = {
        inquiryNumber,
        customerName,
        camera: {
          brand: selectedCamera.brand,
          model: selectedCamera.model,
          resolutionX: selectedCamera.resolutionX,
          resolutionY: selectedCamera.resolutionY,
          sensorWidth: selectedCamera.sensorWidth,
          sensorHeight: selectedCamera.sensorHeight,
        },
        lensFocal: lensfocal,
        workingDistance,
        aiveModel,
        product: { width: productWidth, height: productHeight, heightZ: productHeightZ },
        results: {
          fovX: results.fovX, fovY: results.fovY,
          inspectionArea: results.inspectionArea, pixelSize: results.pixelSize,
          angleX: results.angleX, angleY: results.angleY,
          avgError: results.avgError,
          shapeErrorX: results.shapeErrorX, shapeErrorY: results.shapeErrorY,
          maxErrorX: results.maxErrorX, maxErrorY: results.maxErrorY,
          productsPerFov: results.productsPerFov, coverage: results.coverage,
          efficiency: results.efficiency,
          theoreticalProductCount: results.theoreticalProductCount,
        },
        canvasImage,
      };

      const response = await fetch(`/api/optics-calculator/pdf?inline=${inline ? "1" : "0"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("PDF 생성 실패");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (inline) {
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl(url);
        setPdfDialogOpen(true);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `optics_report${inquiryNumber ? `_${inquiryNumber}` : ""}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      toast({ title: "오류", description: err.message || "PDF 생성에 실패했습니다", variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  };

  const drawOpticsVisualization = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (!results) return;

    const { width, height } = canvas;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2 + panX;
    const centerY = height / 2 + panY;
    
    const baseScale = Math.min(width / (results.fovX * 1.5), height / (results.fovY * 1.5));
    const scale = baseScale * zoomFactor;

    const aiveSpec = AIVE_SPECS[aiveModel as keyof typeof AIVE_SPECS];
    if (aiveSpec) {
      const aiveWidth = aiveSpec.width * scale;
      const aiveHeight = aiveSpec.height * scale;
      
      const isUnifeeder = aiveModel.startsWith('Unifeeder');
      ctx.strokeStyle = isUnifeeder ? '#059669' : '#6B46C1';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        centerX - aiveWidth / 2,
        centerY - aiveHeight / 2,
        aiveWidth,
        aiveHeight
      );
      
      ctx.fillStyle = isUnifeeder ? '#059669' : '#6B46C1';
      ctx.font = 'bold 12px Inter';
      ctx.fillText(
        `${aiveModel} (${aiveSpec.width}×${aiveSpec.height}mm)`,
        centerX - aiveWidth / 2 + 5,
        centerY - aiveHeight / 2 - 5
      );
    }

    const fovWidth = results.fovX * scale;
    const fovHeight = results.fovY * scale;
    
    ctx.setLineDash([]);
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 3;
    ctx.strokeRect(
      centerX - fovWidth / 2,
      centerY - fovHeight / 2,
      fovWidth,
      fovHeight
    );

    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.fillRect(
      centerX - fovWidth / 2,
      centerY - fovHeight / 2,
      fovWidth,
      fovHeight
    );

    const safeW = Math.max(productWidth, 0.1);
    const safeH = Math.max(productHeight, 0.1);
    const productsInX = Math.floor(results.fovX / safeW);
    const productsInY = Math.floor(results.fovY / safeH);
    
    const effectiveFovWidth = (results.effectiveFovX || results.fovX) * scale;
    const effectiveFovHeight = (results.effectiveFovY || results.fovY) * scale;
    
    const productPixelWidth = safeW * scale;
    const productPixelHeight = safeH * scale;

    const isCircular = productWidth === productHeight;

    ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
    ctx.fillRect(
      centerX - effectiveFovWidth / 2,
      centerY - effectiveFovHeight / 2,
      effectiveFovWidth,
      effectiveFovHeight
    );
    
    ctx.strokeStyle = '#22C55E';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(
      centerX - effectiveFovWidth / 2,
      centerY - effectiveFovHeight / 2,
      effectiveFovWidth,
      effectiveFovHeight
    );
    ctx.setLineDash([]);

    const actualProductCount = results.theoreticalProductCount || 0;
    const totalPositions = productsInX * productsInY;
    
    const activePositions = new Set<number>();
    
    let seed = 1;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    
    while (activePositions.size < actualProductCount && activePositions.size < totalPositions) {
      const randomIndex = Math.floor(random() * totalPositions);
      activePositions.add(randomIndex);
    }
    
    let positionIndex = 0;
    for (let x = 0; x < productsInX; x++) {
      for (let y = 0; y < productsInY; y++) {
        const pixelX = centerX - fovWidth / 2 + x * productPixelWidth;
        const pixelY = centerY - fovHeight / 2 + y * productPixelHeight;
        
        const isActive = activePositions.has(positionIndex);
        
        if (isActive) {
          ctx.fillStyle = isCircular ? '#10B981' : '#F59E0B';
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 2;
        } else {
          ctx.fillStyle = isCircular ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)';
          ctx.strokeStyle = 'rgba(55, 65, 81, 0.2)';
          ctx.lineWidth = 1;
        }
        
        if (isCircular) {
          const radius = Math.min(productPixelWidth, productPixelHeight) / 2 - 1;
          ctx.beginPath();
          ctx.arc(pixelX + productPixelWidth / 2, pixelY + productPixelHeight / 2, radius, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(pixelX + 1, pixelY + 1, productPixelWidth - 2, productPixelHeight - 2);
          ctx.strokeRect(pixelX + 1, pixelY + 1, productPixelWidth - 2, productPixelHeight - 2);
        }
        
        positionIndex++;
      }
    }

    const cameraY = centerY - fovHeight / 2 - workingDistance * scale / 10;
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(centerX - 15, cameraY - 5, 30, 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px Inter';
    ctx.fillText('카메라', centerX - 12, cameraY + 2);

    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(centerX, cameraY + 5);
    ctx.lineTo(centerX, centerY - fovHeight / 2);
    ctx.stroke();

    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 12px Inter';
    ctx.fillText(`WD: ${workingDistance}mm`, centerX + 10, (cameraY + centerY - fovHeight / 2) / 2);

    drawGrid(ctx, centerX, centerY, scale, fovWidth, fovHeight);
    drawDimensions(ctx, centerX, centerY, fovWidth, fovHeight, results);
    drawLegend(ctx, width, height);
    drawInfoPanel(ctx, width, height, results, aiveModel);
  }, [results, panX, panY, zoomFactor, aiveModel, productWidth, productHeight, productHeightZ, workingDistance]);

  const drawGrid = (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, scale: number, fovWidth: number, fovHeight: number) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    const gridSpacing = Math.max(10, 50 / zoomFactor) * scale;
    
    for (let x = centerX - fovWidth / 2; x <= centerX + fovWidth / 2; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, centerY - fovHeight / 2);
      ctx.lineTo(x, centerY + fovHeight / 2);
      ctx.stroke();
    }

    for (let y = centerY - fovHeight / 2; y <= centerY + fovHeight / 2; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(centerX - fovWidth / 2, y);
      ctx.lineTo(centerX + fovWidth / 2, y);
      ctx.stroke();
    }
  };

  const drawDimensions = (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, fovWidth: number, fovHeight: number, results: OpticsResults) => {
    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 11px Inter';
    
    ctx.fillText(
      `${results.fovX}mm`,
      centerX - fovWidth / 2,
      centerY + fovHeight / 2 + 20
    );
    
    ctx.save();
    ctx.translate(centerX - fovWidth / 2 - 20, centerY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${results.fovY}mm`, -20, 0);
    ctx.restore();
  };

  const drawLegend = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const legendX = 10;
    const legendY = height - 100;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(legendX, legendY, 200, 90);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Inter';
    ctx.fillText('범례', legendX + 10, legendY + 20);
    
    const legendItems = [
      { color: '#3B82F6', text: 'FOV 영역 (전체)' },
      { color: '#22C55E', text: '실제 사용 영역' },
      { color: '#6B46C1', text: 'AIVE 시스템' },
      { color: '#059669', text: 'Unifeeder 시스템' },
      { color: '#F59E0B', text: '제품 (검출 가능)' },
      { color: 'rgba(245, 158, 11, 0.15)', text: '제품 (분산 표시)' }
    ];
    
    legendItems.forEach((item, index) => {
      const y = legendY + 35 + index * 12;
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX + 10, y - 4, 10, 8);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px Inter';
      ctx.fillText(item.text, legendX + 25, y + 2);
    });
  };

  const drawInfoPanel = (ctx: CanvasRenderingContext2D, width: number, height: number, results: OpticsResults, aiveModel: string) => {
    const panelX = width - 250;
    const panelY = 10;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(panelX, panelY, 240, 200);
    
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, 240, 200);
    
    ctx.fillStyle = '#3B82F6';
    ctx.font = 'bold 14px Inter';
    ctx.fillText('계산 결과', panelX + 10, panelY + 25);
    
    const safePW = Math.max(productWidth, 0.1);
    const safePH = Math.max(productHeight, 0.1);
    const totalPositions = Math.floor(results.fovX / safePW) * Math.floor(results.fovY / safePH);
    const distributionRate = totalPositions > 0 ? ((results.theoreticalProductCount || 0) / totalPositions * 100).toFixed(1) : "0.0";
    
    const info = [
      `전체 FOV: ${results.fovX} × ${results.fovY} mm`,
      `픽셀 크기: ${results.pixelSize} mm`,
      `시야각: ${results.angleX}° × ${results.angleY}°`,
      `평균 오차: ±${results.avgError} mm`,
      `전체 위치: ${totalPositions}개`,
      `이론 제품: ${results.theoreticalProductCount}개`,
      `이론 수량: ${results.theoreticalProductCount}개`,
      `분산도: ${distributionRate}% (전체 영역 대비)`,
      `효율성: ${results.efficiency}`
    ];
    
    ctx.fillStyle = '#E5E7EB';
    ctx.font = '11px Inter';
    info.forEach((text, index) => {
      ctx.fillText(text, panelX + 10, panelY + 50 + index * 16);
    });
    
    if (productHeightZ > 0) {
      ctx.fillStyle = '#F59E0B';
      ctx.font = 'bold 11px Inter';
      ctx.fillText('높이 오차 분석', panelX + 10, panelY + 170);
      
      ctx.fillStyle = '#FEF3C7';
      ctx.font = '10px Inter';
      ctx.fillText(`Shape 오차: ${results.shapeErrorX?.toFixed(3)} / ${results.shapeErrorY?.toFixed(3)} mm`, panelX + 10, panelY + 185);
      ctx.fillText(`최대 오차: ${results.maxErrorX?.toFixed(3)} / ${results.maxErrorY?.toFixed(3)} mm`, panelX + 10, panelY + 200);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card data-testid="camera-selection-card">
          <CardHeader>
            <CardTitle>카메라 선택</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="camera-model">카메라 모델</Label>
              <Select 
                value={selectedCamera?.model || ""} 
                onValueChange={(value) => {
                  const camera = cameraModels?.find(c => c.model === value);
                  setSelectedCamera(camera || null);
                }}
              >
                <SelectTrigger data-testid="select-camera-model">
                  <SelectValue placeholder="카메라 모델 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(cameraModels || []).map((camera) => (
                    <SelectItem key={camera.id} value={camera.model}>
                      {camera.brand} {camera.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>해상도 X</Label>
                <Input 
                  value={selectedCamera?.resolutionX || 0} 
                  disabled 
                  className="bg-muted"
                  data-testid="input-resolution-x"
                />
              </div>
              <div>
                <Label>해상도 Y</Label>
                <Input 
                  value={selectedCamera?.resolutionY || 0} 
                  disabled 
                  className="bg-muted"
                  data-testid="input-resolution-y"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="lens-focal">렌즈 초점거리</Label>
              <Select 
                value={lensfocal.toString()} 
                onValueChange={(value) => setLensfocal(Number(value))}
              >
                <SelectTrigger data-testid="select-lens-focal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LENS_DATABASE.map((lens) => (
                    <SelectItem key={lens.value} value={lens.value.toString()}>
                      {lens.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="working-distance">작업거리 (mm)</Label>
              <div className="space-y-2">
                <Input
                  id="working-distance"
                  type="number"
                  value={workingDistance}
                  onChange={(e) => setWorkingDistance(Number(e.target.value))}
                  min={50}
                  max={5000}
                  data-testid="input-working-distance"
                />
                <Slider
                  value={[workingDistance]}
                  onValueChange={(value) => setWorkingDistance(value[0])}
                  min={100}
                  max={2000}
                  step={50}
                  className="mt-2"
                  data-testid="slider-working-distance"
                />
                <div className="text-xs text-muted-foreground">
                  슬라이더: 100-2000mm | 직접입력: 50-5000mm
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="aive-model">시스템 모델</Label>
              <Select value={aiveModel} onValueChange={setAiveModel}>
                <SelectTrigger data-testid="select-aive-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AIVE2.2">AIVE2.2 (150x120mm)</SelectItem>
                  <SelectItem value="AIVE3.0">AIVE3.0 (230x180mm)</SelectItem>
                  <SelectItem value="Unifeeder2.0">Unifeeder2.0 (200x150mm)</SelectItem>
                  <SelectItem value="Unifeeder3.0">Unifeeder3.0 (300x200mm)</SelectItem>
                  <SelectItem value="Unifeeder5.0">Unifeeder5.0 (500x350mm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="product-settings-card">
          <CardHeader>
            <CardTitle>제품 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product-width">가로 (mm)</Label>
                <Input
                  id="product-width"
                  type="number"
                  value={productWidth}
                  onChange={(e) => setProductWidth(Number(e.target.value))}
                  data-testid="input-product-width"
                />
              </div>
              <div>
                <Label htmlFor="product-height">세로 (mm)</Label>
                <Input
                  id="product-height"
                  type="number"
                  value={productHeight}
                  onChange={(e) => setProductHeight(Number(e.target.value))}
                  data-testid="input-product-height"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="product-height-z">높이 (mm)</Label>
              <Input
                id="product-height-z"
                type="number"
                value={productHeightZ}
                onChange={(e) => setProductHeightZ(Number(e.target.value))}
                data-testid="input-product-height-z"
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg text-xs">
              <div className="font-medium text-blue-700 dark:text-blue-300 mb-1">입력 가이드</div>
              <div className="text-blue-600 dark:text-blue-400 space-y-1">
                <div>- 사각형 제품: 가로/세로를 다르게 입력</div>
                <div>- 원형 제품: 가로/세로를 지름으로 동일하게 입력</div>
                <div>- 높이: 제품이 세워진 부분의 높이 (오차 계산용)</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {results && (
          <Card data-testid="results-card">
            <CardHeader>
              <CardTitle>계산 결과</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">검사 영역:</span>
                  <span className="ml-2 font-mono" data-testid="text-inspection-area">{results.inspectionArea} mm2</span>
                </div>
                <div>
                  <span className="text-muted-foreground">FOV:</span>
                  <span className="ml-2 font-mono" data-testid="text-fov">{results.fovX} x {results.fovY} mm</span>
                </div>
                <div>
                  <span className="text-muted-foreground">픽셀 크기:</span>
                  <span className="ml-2 font-mono" data-testid="text-pixel-size">{results.pixelSize} mm</span>
                </div>
                <div>
                  <span className="text-muted-foreground">시야각:</span>
                  <span className="ml-2 font-mono" data-testid="text-angle">{results.angleX} x {results.angleY}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">평균 오차:</span>
                  <span className="ml-2 font-mono" data-testid="text-avg-error">+/-{results.avgError} mm</span>
                </div>
                <div>
                  <span className="text-muted-foreground">이론 수량:</span>
                  <span className="ml-2 font-mono" data-testid="text-products-per-fov">{results.productsPerFov}개</span>
                </div>
                <div>
                  <span className="text-muted-foreground">실제 수량:</span>
                  <span className="ml-2 font-mono text-green-600 dark:text-green-400" data-testid="text-theoretical-count">{results.theoreticalProductCount}개</span>
                </div>
                <div>
                  <span className="text-muted-foreground">커버리지:</span>
                  <span className="ml-2 font-mono" data-testid="text-coverage">{results.coverage}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">효율성:</span>
                  <span className={`ml-2 font-mono ${
                    results.efficiency === '우수' ? 'text-green-600 dark:text-green-400' :
                    results.efficiency === '양호' ? 'text-blue-600 dark:text-blue-400' :
                    results.efficiency === '보통' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                  }`} data-testid="text-efficiency">{results.efficiency}</span>
                </div>
              </div>
              
              {productHeightZ > 0 && (
                <div className="border-t pt-3 mt-3">
                  <div className="text-sm font-semibold mb-2">높이 오차 분석</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Shape 오차:</span>
                      <span className="ml-2 font-mono text-orange-600 dark:text-orange-400" data-testid="text-shape-error">
                        {results.shapeErrorX} / {results.shapeErrorY} mm
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">최대 오차:</span>
                      <span className="ml-2 font-mono text-red-600 dark:text-red-400" data-testid="text-max-error">
                        {results.maxErrorX} / {results.maxErrorY} mm
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card data-testid="visualization-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>FOV 시각화</CardTitle>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setZoomFactor(prev => Math.min(5, prev * 1.2))}
                  data-testid="button-zoom-in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setZoomFactor(prev => Math.max(0.5, prev * 0.8))}
                  data-testid="button-zoom-out"
                >
                  축소
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={resetView}
                  data-testid="button-reset-view"
                >
                  리셋
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-fullscreen">
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-6xl">
                    <DialogHeader>
                      <DialogTitle>FOV 시각화 - 확대 보기</DialogTitle>
                    </DialogHeader>
                    <div>
                      <Canvas 
                        width={1000} 
                        height={700} 
                        onDraw={drawOpticsVisualization}
                        className="w-full h-auto border border-muted cursor-grab active:cursor-grabbing"
                        data-testid="canvas-optics-large"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onWheel={handleWheel}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded">
                      <strong>조작법:</strong> 마우스 휠로 확대/축소, 드래그로 이동, 리셋 버튼으로 초기화
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>확대: {(zoomFactor * 100).toFixed(0)}%  |  팬: X:{panX.toFixed(0)} Y:{panY.toFixed(0)}</span>
              <div className="flex space-x-4">
                <span className="flex items-center">
                  <span className="w-3 h-3 bg-blue-500 rounded-full mr-1"></span>FOV 영역
                </span>
                <span className="flex items-center">
                  <span className="w-3 h-3 bg-purple-500 rounded-full mr-1"></span>AIVE 시스템
                </span>
                <span className="flex items-center">
                  <span className="w-3 h-3 bg-amber-500 rounded-full mr-1"></span>제품
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Canvas 
                ref={canvasHandleRef}
                width={600} 
                height={400} 
                onDraw={drawOpticsVisualization}
                className="w-full h-auto cursor-grab active:cursor-grabbing"
                data-testid="canvas-optics"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              />
            </div>
            {showPdf && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!results || pdfLoading}
                  onClick={() => handlePdfExport(true)}
                  data-testid="button-pdf-preview"
                >
                  {pdfLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileDown className="h-3 w-3 mr-1" />}
                  PDF 보기
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!results || pdfLoading}
                  onClick={() => handlePdfExport(false)}
                  data-testid="button-pdf-download"
                >
                  <FileDown className="h-3 w-3 mr-1" />
                  PDF 다운로드
                </Button>
              </div>
            )}
            <div className="bg-muted/20 p-3 rounded text-xs mt-3">
              <div className="font-medium mb-1">팁</div>
              <div className="text-muted-foreground">
                작업거리(WD)와 렌즈 초점거리를 조정하여 최적의 FOV를 설정하세요. 
                제품이 FOV 영역 내에 효율적으로 배치되도록 하고, AIVE 시스템 사양과 비교해보세요.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={pdfDialogOpen} onOpenChange={(open) => {
        setPdfDialogOpen(open);
        if (!open && pdfPreviewUrl) {
          URL.revokeObjectURL(pdfPreviewUrl);
          setPdfPreviewUrl("");
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>광학 계산기 리포트</DialogTitle>
          </DialogHeader>
          {pdfPreviewUrl && (
            <iframe
              src={pdfPreviewUrl}
              className="w-full h-[70vh]"
              title="광학 계산기 PDF 미리보기"
              data-testid="iframe-optics-pdf-preview"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

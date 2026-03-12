import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";

interface CanvasProps {
  width: number;
  height: number;
  onDraw: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void;
  className?: string;
  onMouseDown?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onWheel?: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  "data-testid"?: string;
}

export interface CanvasHandle {
  toDataURL: (type?: string, quality?: number) => string;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas({
  width,
  height,
  onDraw,
  className,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onWheel,
  "data-testid": dataTestId,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    toDataURL: (type?: string, quality?: number) => {
      return canvasRef.current?.toDataURL(type, quality) ?? "";
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onDraw(ctx, canvas);
  }, [onDraw, width, height]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    onWheel?.(e);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onWheel={handleWheel}
      data-testid={dataTestId}
    />
  );
});

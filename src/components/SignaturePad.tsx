import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
}

interface Props {
  label?: string;
  onChange?: (dataUrl: string | null) => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  ({ label = "Signature *", onChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const emptyRef = useRef(true);
    const [, setTick] = useState(0);

    const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = getCtx();
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#000";
      }
    };

    useEffect(() => {
      resize();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pos = (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const start = (e: React.PointerEvent) => {
      const ctx = getCtx();
      if (!ctx) return;
      drawingRef.current = true;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      (e.target as Element).setPointerCapture(e.pointerId);
    };

    const move = (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      const ctx = getCtx();
      if (!ctx) return;
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      emptyRef.current = false;
    };

    const end = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      setTick((t) => t + 1);
      onChange?.(emptyRef.current ? null : canvasRef.current!.toDataURL("image/png"));
    };

    const clear = () => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      emptyRef.current = true;
      setTick((t) => t + 1);
      onChange?.(null);
    };

    useImperativeHandle(ref, () => ({
      clear,
      isEmpty: () => emptyRef.current,
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
    }));

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{label}</Label>
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            Clear
          </Button>
        </div>
        <div className="rounded-md border bg-background">
          <canvas
            ref={canvasRef}
            className="block h-40 w-full touch-none rounded-md"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
        </div>
        {emptyRef.current && (
          <p className="text-xs text-muted-foreground">Draw your signature above.</p>
        )}
      </div>
    );
  },
);
SignaturePad.displayName = "SignaturePad";

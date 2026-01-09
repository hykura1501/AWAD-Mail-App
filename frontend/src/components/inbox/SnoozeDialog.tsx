import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SnoozeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (snoozeUntil: Date) => void;
  emailSubject?: string;
}

type SnoozePreset = "1hour" | "3hours" | "tomorrow" | "nextweek" | "custom";

export function SnoozeDialog({
  open,
  onOpenChange,
  onConfirm,
  emailSubject,
}: SnoozeDialogProps) {
  const [preset, setPreset] = useState<SnoozePreset>("1hour");
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");

  const calculateSnoozeDate = (): Date | null => {
    const now = new Date();

    switch (preset) {
      case "1hour":
        return new Date(now.getTime() + 60 * 60 * 1000);
      case "3hours":
        return new Date(now.getTime() + 3 * 60 * 60 * 1000);
      case "tomorrow": {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow;
      }
      case "nextweek": {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextWeek.setHours(9, 0, 0, 0);
        return nextWeek;
      }
      case "custom": {
        if (!customDate || !customTime) return null;
        const dateTime = new Date(`${customDate}T${customTime}`);
        return isNaN(dateTime.getTime()) ? null : dateTime;
      }
      default:
        return null;
    }
  };

  const handleConfirm = () => {
    const snoozeDate = calculateSnoozeDate();
    if (snoozeDate) {
      onConfirm(snoozeDate);
      onOpenChange(false);
      // Reset form
      setPreset("1hour");
      setCustomDate("");
      setCustomTime("");
    }
  };

  const getFormattedDateTime = (date: Date): string => {
    return date.toLocaleString("vi-VN", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const snoozeDate = calculateSnoozeDate();
  const isValidCustom = preset !== "custom" || (customDate && customTime);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!sm:max-w-[30vw]">
        <DialogHeader>
          <DialogTitle>Snooze Email</DialogTitle>
          <DialogDescription>
            {emailSubject
              ? `Chọn thời gian để email "${emailSubject}" quay lại hộp thư.`
              : "Chọn thời gian để email quay lại hộp thư."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="preset">Thời gian snooze</Label>
            <Select
              value={preset}
              onValueChange={(value) => setPreset(value as SnoozePreset)}
            >
              <SelectTrigger id="preset">
                <SelectValue placeholder="Chọn thời gian" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1hour">1 giờ</SelectItem>
                <SelectItem value="3hours">3 giờ</SelectItem>
                <SelectItem value="tomorrow">Ngày mai (9:00 AM)</SelectItem>
                <SelectItem value="nextweek">Tuần sau (9:00 AM)</SelectItem>
                <SelectItem value="custom">Tùy chỉnh</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preset === "custom" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="custom-date">Ngày</Label>
                <Input
                  id="custom-date"
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="custom-time">Giờ</Label>
                <Input
                  id="custom-time"
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                />
              </div>
            </>
          )}

          {snoozeDate && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium">Email sẽ quay lại vào:</p>
              <p className="text-muted-foreground">
                {getFormattedDateTime(snoozeDate)}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!isValidCustom || !snoozeDate}
          >
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

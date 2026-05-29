"use client";
import { useState, useRef, useEffect } from "react";
import { X, Upload, Check, Sparkles, Image as ImageIcon } from "lucide-react";

interface AvatarEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentAvatar: string;
  onAvatarUpdated: (newAvatar: string) => void;
}

// 10 Preset DiceBear Adventurer cực kỳ cao cấp và sinh động
const ADVENTURER_PRESETS = [
  { name: "Milo", seed: "Milo", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Milo&backgroundColor=ffdfbf" },
  { name: "Oliver", seed: "Oliver", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Oliver&backgroundColor=c0aede" },
  { name: "Sophie", seed: "Sophie", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Sophie&backgroundColor=ffd5dc" },
  { name: "Emma", seed: "Emma", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Emma&backgroundColor=d1f4ff" },
  { name: "Luna", seed: "Luna", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Luna&backgroundColor=b6e3f4" },
  { name: "Jack", seed: "Jack", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Jack&backgroundColor=c0e6ce" },
  { name: "Aria", seed: "Aria", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Aria&backgroundColor=ffdfa9" },
  { name: "Leo", seed: "Leo", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Leo&backgroundColor=ffd5d5" },
  { name: "Zoe", seed: "Zoe", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Zoe&backgroundColor=d5ffd5" },
  { name: "Max", seed: "Max", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Max&backgroundColor=d5d5ff" },
];

export default function AvatarEditModal({
  isOpen,
  onClose,
  userId,
  currentAvatar,
  onAvatarUpdated,
}: AvatarEditModalProps) {
  const [activeTab, setActiveTab] = useState<"dicebear" | "upload">("dicebear");

  // States cho Dicebear
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [customSeed, setCustomSeed] = useState<string>("");
  const [dicebearPreviewUrl, setDicebearPreviewUrl] = useState<string>("");

  // States cho Upload & Crop
  const [imageSrc, setImageSrc] = useState<string>("");
  const [zoom, setZoom] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Kích thước của viewport tròn hiển thị
  const VIEWPORT_SIZE = 200;
  // Kích thước canvas xuất ra (độ phân giải tối ưu, chỉ 120x120 để tối ưu kích thước Base64)
  const OUTPUT_SIZE = 120;

  // Thiết lập ban đầu
  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setImageSrc("");

      // Nếu avatar hiện tại là Dicebear URL
      if (currentAvatar && currentAvatar.includes("dicebear.com")) {
        setDicebearPreviewUrl(currentAvatar);
        // Tìm xem có trùng với preset nào không
        const matched = ADVENTURER_PRESETS.find(p => currentAvatar.includes(`seed=${p.seed}`));
        if (matched) {
          setSelectedPreset(matched.seed);
          setCustomSeed("");
        } else {
          setSelectedPreset("custom");
          // Trích xuất seed từ URL
          const urlObj = new URL(currentAvatar);
          setCustomSeed(urlObj.searchParams.get("seed") || "Agent");
        }
      } else {
        // Mặc định chọn preset đầu tiên
        setSelectedPreset(ADVENTURER_PRESETS[0].seed);
        setDicebearPreviewUrl(ADVENTURER_PRESETS[0].url);
        setCustomSeed("");
      }
    }
  }, [isOpen, currentAvatar]);

  if (!isOpen) return null;

  // Lắng nghe sự kiện kéo di chuyển ảnh (Pan)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSrc) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageSrc) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Hỗ trợ Touch cho thiết bị di động / Trackpad
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!imageSrc || e.touches.length !== 1) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.touches[0].clientX - position.x,
      y: e.touches[0].clientY - position.y,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !imageSrc || e.touches.length !== 1) return;
    setPosition({
      x: e.touches[0].clientX - dragStart.current.x,
      y: e.touches[0].clientY - dragStart.current.y,
    });
  };

  // Chọn tệp ảnh từ máy
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Giới hạn định dạng hình ảnh
    if (!file.type.startsWith("image/")) {
      setMessage({ text: "Vui lòng chọn tệp hình ảnh hợp lệ!", isError: true });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setMessage(null);
    };
    reader.readAsDataURL(file);
  };

  // Chọn một preset cụ thể
  const handleSelectPreset = (preset: typeof ADVENTURER_PRESETS[0]) => {
    setSelectedPreset(preset.seed);
    setCustomSeed("");
    setDicebearPreviewUrl(preset.url);
  };

  // Thực hiện cắt ảnh và lưu avatar lên Backend
  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    let finalAvatarValue = "";

    try {
      if (activeTab === "dicebear") {
        // Với DiceBear, chỉ cần lưu trực tiếp đường dẫn URL cực kỳ gọn nhẹ
        finalAvatarValue = dicebearPreviewUrl;
      } else {
        // Với Upload ảnh, tiến hành crop trên Canvas tạo ảnh Base64
        if (!imageSrc || !imageRef.current) {
          setMessage({ text: "Vui lòng chọn ảnh trước khi lưu!", isError: true });
          setLoading(false);
          return;
        }

        const img = imageRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          throw new Error("Không thể khởi tạo Canvas Context.");
        }

        // Tỷ lệ chuyển đổi từ kích thước hiển thị tròn (200px) sang kích thước canvas thật (120px)
        const ratio = OUTPUT_SIZE / VIEWPORT_SIZE;

        // Tính kích thước hình cơ sở giữ nguyên tỷ lệ khung hình
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        let baseWidth = VIEWPORT_SIZE;
        let baseHeight = VIEWPORT_SIZE;

        if (naturalWidth > naturalHeight) {
          baseHeight = VIEWPORT_SIZE;
          baseWidth = VIEWPORT_SIZE * (naturalWidth / naturalHeight);
        } else {
          baseWidth = VIEWPORT_SIZE;
          baseHeight = VIEWPORT_SIZE * (naturalHeight / naturalWidth);
        }

        // Áp dụng scale zoom
        const W = baseWidth * zoom;
        const H = baseHeight * zoom;

        // Tính toán vị trí góc trên bên trái của ảnh vẽ trên Canvas
        // Phép tính dựa trên việc căn giữa ban đầu của ảnh + dịch chuyển pan (position)
        const canvasW = W * ratio;
        const canvasH = H * ratio;
        const canvasLeft = (OUTPUT_SIZE / 2) - (canvasW / 2) + (position.x * ratio);
        const canvasTop = (OUTPUT_SIZE / 2) - (canvasH / 2) + (position.y * ratio);

        // Vẽ ảnh lên canvas tròn
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE); // Điền màu nền trắng đề phòng PNG trong suốt
        ctx.drawImage(img, canvasLeft, canvasTop, canvasW, canvasH);

        // Xuất sang Base64 chuẩn JPEG tối ưu chất lượng để giảm kích thước tối đa (~8-12KB)
        finalAvatarValue = canvas.toDataURL("image/jpeg", 0.75);
      }

      // Gửi API cập nhật lên Firestore
      const response = await fetch(`https://localhost:7210/api/user/profile/${userId}/avatar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ avatar: finalAvatarValue }),
      });

      if (response.ok) {
        onAvatarUpdated(finalAvatarValue);
        setMessage({ text: "Cập nhật ảnh đại diện thành công!", isError: false });
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setMessage({ text: errorData.message || "Không thể cập nhật ảnh lên server.", isError: true });
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ text: "Lỗi kết nối máy chủ. Vui lòng thử lại!", isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-sm px-4">
      {/* Khung Modal chính */}
      <div className="relative w-full max-w-xl bg-[#15171e] border-2 border-gray-800 rounded-3xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300">

        {/* Nút đóng */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-full transition"
        >
          <X size={20} />
        </button>

        {/* Tiêu đề */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center justify-center gap-2">
            <Sparkles className="text-[#e6a822]" size={22} />
            ĐỔI ẢNH ĐẠI DIỆN
          </h2>
          <p className="text-gray-400 text-xs mt-1">Định dạng ô tròn hiển thị trên danh sách và trò chơi</p>
        </div>

        {/* Tabs chọn nguồn */}
        <div className="flex bg-[#0b0c0f] p-1 rounded-xl mb-6 border border-gray-800">
          <button
            onClick={() => setActiveTab("dicebear")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all duration-200
              ${activeTab === "dicebear"
                ? "bg-[#e6a822] text-black shadow-md"
                : "text-gray-400 hover:text-white"
              }`}
          >
            Avatar hoạt hình
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all duration-200
              ${activeTab === "upload"
                ? "bg-[#e6a822] text-black shadow-md"
                : "text-gray-400 hover:text-white"
              }`}
          >
            <ImageIcon size={16} />
            Tải ảnh
          </button>
        </div>

        {/* --- NỘI DUNG CHI TIẾT --- */}
        <div className="min-h-[280px] flex flex-col items-center">

          {/* TAB 1: DICEBEAR ADVENTURER */}
          {activeTab === "dicebear" && (
            <div className="w-full flex flex-col items-center">

              {/* Khung Preview Tròn */}
              <div className="relative w-28 h-28 rounded-full border-[3px] border-[#e6a822] bg-[#1a1c23] shadow-lg mb-6 overflow-hidden flex items-center justify-center p-1 bg-gradient-to-tr from-gray-900 to-[#15171e]">
                {dicebearPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dicebearPreviewUrl} alt="Dicebear Preview" className="w-full h-full object-contain rounded-full" />
                ) : (
                  <div className="animate-pulse w-full h-full rounded-full bg-gray-800" />
                )}
                <div className="absolute -bottom-1 -right-1 bg-amber-500 text-black p-1.5 rounded-full border border-black shadow">
                  <Sparkles size={12} />
                </div>
              </div>

              {/* Phông hiển thị các model Adventurer gợi ý trước */}
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3 self-start">Chọn các Models gợi ý:</p>

              <div className="grid grid-cols-5 gap-3 w-full mb-2 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                {ADVENTURER_PRESETS.map((preset) => (
                  <button
                    key={preset.seed}
                    onClick={() => handleSelectPreset(preset)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-200 p-0.5 bg-[#0b0c0f] hover:scale-105
                      ${selectedPreset === preset.seed
                        ? "border-[#e6a822] shadow-[0_0_8px_rgba(230,168,34,0.4)]"
                        : "border-gray-800 hover:border-gray-600"
                      }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preset.url} alt={preset.name} className="w-full h-full object-contain rounded-lg" />
                    {selectedPreset === preset.seed && (
                      <div className="absolute top-1 right-1 bg-[#e6a822] rounded-full p-0.5">
                        <Check size={8} color="black" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD & CROP */}
          {activeTab === "upload" && (
            <div className="w-full flex flex-col items-center">
              {!imageSrc ? (
                // Khu vực kéo thả tệp ảnh chưa chọn
                <label className="w-full h-48 border-2 border-dashed border-gray-800 hover:border-[#e6a822] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition bg-[#0b0c0f] group">
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  <Upload className="text-gray-500 group-hover:text-[#e6a822] mb-3 transition transform group-hover:-translate-y-1" size={32} />
                  <span className="text-sm text-gray-300 font-bold">Chọn ảnh từ thiết bị của bạn</span>
                  <span className="text-xs text-gray-500 mt-1">Định dạng JPG, PNG, WEBP</span>
                </label>
              ) : (
                // Giao diện cắt ảnh
                <div className="w-full flex flex-col items-center">

                  {/* Khung Viewport Tròn chứa ảnh để Cắt */}
                  <div
                    className="relative border-4 border-gray-800 bg-[#07080a] shadow-inner select-none cursor-move rounded-full overflow-hidden"
                    style={{
                      width: `${VIEWPORT_SIZE}px`,
                      height: `${VIEWPORT_SIZE}px`,
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUpOrLeave}
                    onMouseLeave={handleMouseUpOrLeave}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleMouseUpOrLeave}
                  >
                    {/* Ảnh nguồn để Pan và Zoom */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={imageRef}
                      src={imageSrc}
                      alt="To Crop"
                      draggable="false"
                      className="absolute max-w-none origin-center pointer-events-none transition-transform duration-75 ease-out"
                      style={{
                        left: "50%",
                        top: "50%",
                        transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                        // Giữ tỷ lệ cover hình tròn
                        height: "100%",
                        width: "auto"
                      }}
                    />

                    {/* Lớp phủ lưới hướng dẫn cắt dạng mờ */}
                    <div className="absolute inset-0 rounded-full border border-[#e6a822]/40 pointer-events-none shadow-[inset_0_0_15px_rgba(0,0,0,0.6)]" />
                  </div>

                  {/* Thanh trượt thu phóng (Zoom Slider) */}
                  <div className="w-full max-w-xs flex items-center gap-3 mt-5">
                    <span className="text-xs text-gray-500 font-bold">THU</span>
                    <input
                      type="range"
                      min="1"
                      max="3.5"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#e6a822]"
                    />
                    <span className="text-xs text-gray-500 font-bold">PHÓNG</span>
                  </div>

                  {/* Nút Chọn lại ảnh */}
                  <label className="mt-4 text-xs text-[#e6a822]/80 hover:text-[#e6a822] font-bold cursor-pointer underline">
                    Chọn ảnh khác
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* --- PHẦN THÔNG BÁO VÀ NÚT TÁC VỤ --- */}
        <div className="mt-8 border-t border-gray-800 pt-5 w-full">
          {message && (
            <div className={`text-xs md:text-sm font-bold text-center mb-4 py-2 px-3 rounded-lg border
              ${message.isError
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-green-500/10 border-green-500/30 text-green-400"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl transition text-sm disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handleSave}
              disabled={loading || (activeTab === "upload" && !imageSrc)}
              className="flex-1 py-3 bg-[#e6a822] hover:bg-[#c99017] text-black font-black rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(230,168,34,0.2)]"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  ĐANG LƯU...
                </>
              ) : (
                <>
                  LƯU THAY ĐỔI
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

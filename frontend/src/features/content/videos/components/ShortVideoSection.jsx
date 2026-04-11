import React, { useState, useEffect } from "react";
import { Play, Loader2 } from "lucide-react";
import { shortVideoAPI } from "../api/shortVideos.api";
import { toast } from "sonner";

// ✅ HELPER: Convert path to URL
const getMediaUrl = (path) => {
  if (!path) return "/placeholder.png";
  if (path.startsWith("http")) return path;
  const baseUrl =
    import.meta.env.VITE_API_URL?.replace("/api", "") ||
    "http://localhost:5000";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};

const ShortVideoSection = ({
  title = "Video ngắn",
  videoLimit = 6,
  videoType = "latest",
  onVideoClick,
}) => {
  const [videos, setVideos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadVideos();
  }, [videoType, videoLimit]);

  const loadVideos = async () => {
    setIsLoading(true);
    try {
      const response =
        videoType === "trending"
          ? await shortVideoAPI.getTrending(videoLimit)
          : await shortVideoAPI.getPublished({ limit: videoLimit });
      const videoData = response.data?.data?.videos || [];
      setVideos(videoData);
    } catch (error) {
      console.error("Error loading videos:", error);
      toast.error("Không thể tải video");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <section className="py-8 bg-gradient-to-b from-white to-gray-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
          </div>
        </div>
      </section>
    );
  }

  if (!videos.length) return null;

  return (
    <section className="py-8 bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-black to-gray-500 flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              {title}
            </h2>
          </div>
        </div>

        {/* Horizontal Scrollable Row - Mobile: 1 row scroll ngang, Desktop: 6 cố định */}
        <div className="overflow-x-auto hide-scrollbar md:overflow-visible">
          <div className="flex md:grid md:grid-cols-6 gap-3 md:gap-4">
            {videos.slice(0, 6).map((video, index) => (
              <button
                key={video._id}
                onClick={() => {
                  console.log("Clicked video:", { index, title: video.title });
                  onVideoClick(index, videos);
                }}
                className="group relative aspect-[9/16] w-[42vw] md:w-auto flex-shrink-0 rounded-2xl overflow-hidden bg-gray-900 hover:scale-105 transition-transform duration-300 shadow-lg hover:shadow-2xl"
              >
                {/* Thumbnail */}
                <img
                  src={getMediaUrl(video.thumbnailUrl)}
                  alt={video.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = "/placeholder.png";
                  }}
                />

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

                {/* Play Icon Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                    <Play className="w-6 h-6 md:w-8 md:h-8 text-white fill-white" />
                  </div>
                </div>

                {/* Title Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                  <h3 className="font-semibold text-xs md:text-sm line-clamp-2">
                    {video.title}
                  </h3>
                </div>

                {/* Hover Border Glow */}
                <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-pink-500/50 transition-colors"></div>
              </button>
            ))}
          </div>
        </div>

        {/* View All Button */}
        <div className="text-center mt-6">
          <button
            onClick={() => (window.location.href = "/videos")}
            className="px-6 py-2.5 bg-gradient-to-r from-black to-slate-600 text-white rounded-full font-semibold hover:shadow-lg hover:scale-105 transition-all"
          >
            Xem tất cả video
          </button>
        </div>
      </div>

      {/* Ẩn thanh cuộn ngang trên mobile (tùy chọn đẹp hơn) */}
      <style>{`
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
};

export default ShortVideoSection;

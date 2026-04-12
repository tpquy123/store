import React from "react";
import { Link } from "react-router-dom";
import { FacebookIcon } from "lucide-react";

const PublicFooter = ({ footerCategoryLinks, setDesktopStoreMenuOpen }) => (
      <footer className="bg-black text-white py-8 md:py-12 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Logo and Social Media - Mobile Center, Desktop Left */}
          <div className="mb-8 md:mb-12">
            <Link
              to="/"
              className="inline-block transition-all duration-300 hover:scale-105"
            >
              <img 
                src="/logo.jpg" 
                alt="Ninh Kiều iSTORE" 
                className="h-14 md:h-16 w-auto rounded-[30px] object-cover mx-auto md:mx-0"
              />
            </Link>
            <div className="flex items-center justify-center md:justify-start gap-4 md:gap-5 mt-6">
              <a
                href="https://twitter.com/Apple"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-gray-400 transition-all duration-300 hover:scale-110"
              >
                <svg
                  className="w-5 h-5 md:w-6 md:h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/apple/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-gray-400 transition-all duration-300 hover:scale-110"
              >
                <svg
                  className="w-5 h-5 md:w-6 md:h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
              <a
                href="https://www.youtube.com/user/Apple"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-gray-400 transition-all duration-300 hover:scale-110"
              >
                <svg
                  className="w-5 h-5 md:w-6 md:h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/company/apple/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-gray-400 transition-all duration-300 hover:scale-110"
              >
                <svg
                  className="w-5 h-5 md:w-6 md:h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              <a
                href="https://www.facebook.com/apple"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-gray-400 transition-all duration-300 hover:scale-110"
              >
                <FacebookIcon className="w-5 h-5 md:w-6 md:h-6" />
              </a>
            </div>
          </div>

          {/* Footer Links - Responsive Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10 lg:gap-12">
            {/* Column 1 - Mua Sắm Và Tìm Hiểu */}
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-4 text-gray-300">
                Mua Sắm Và Tìm Hiểu
              </h3>
              <ul className="space-y-2.5 md:space-y-3">
                <li>
                  <button
                    onClick={() => setDesktopStoreMenuOpen(true)}
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Cửa Hàng
                  </button>
                </li>
                {footerCategoryLinks.map((link) => (
                  <li key={link.id}>
                    <Link
                      to={link.to}
                      className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300 flex items-center gap-2"
                    >
                      {link.icon ? (
                        <img
                          src={link.icon}
                          alt={link.name}
                          className="w-4 h-4 rounded object-cover flex-shrink-0"
                          loading="lazy"
                        />
                      ) : null}
                      <span className="truncate">{link.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 2 - Tài Khoản */}
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-4 text-gray-300">
                Tài Khoản
              </h3>
              <ul className="space-y-2.5 md:space-y-3">
                <li>
                  <Link
                    to="/profile"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Quản Lý Tài Khoản
                  </Link>
                </li>
                <li>
                  <a
                    href="https://secure8.store.apple.com/vn/shop/signIn/account"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Tài Khoản Apple Store
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.icloud.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    iCloud.com
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3 - Apple Store */}
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-4 text-gray-300">
                Apple Store
              </h3>
              <ul className="space-y-2.5 md:space-y-3">
                <li>
                  <a
                    href="https://apps.apple.com/vn/app/apple-store/id375380948"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Ứng Dụng Apple Store
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.apple.com/vn/shop/trade-in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Apple Trade In
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.apple.com/vn/shop/browse/financing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Tài Chính
                  </a>
                </li>
                <li>
                  <Link
                    to="/profile"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Tình Trạng Đơn Hàng
                  </Link>
                </li>
                <li>
                  <a
                    href="http://localhost:5001"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Tra Cứu Bảo Hành
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.apple.com/vn/shop/help"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Hỗ Trợ Mua Hàng
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 4 - Liên Hệ */}
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-4 text-gray-300">
                Liên Hệ
              </h3>
              <ul className="space-y-2.5 md:space-y-3">
                <li>
                  <a
                    href="tel:1900633909"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Hotline: 1900.633.909
                  </a>
                </li>
                <li>
                  <button
                    onClick={() => setDesktopStoreMenuOpen(true)}
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Tìm Cửa Hàng
                  </button>
                </li>
                <li>
                  <a
                    href="mailto:support@ninhkieuistore.com"
                    className="text-sm md:text-base text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    Email Hỗ Trợ
                  </a>
                </li>
                <li>
                  <p className="text-sm md:text-base text-gray-400">
                    Cần Thơ, Việt Nam
                  </p>
                </li>
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-gray-800 mt-8 md:mt-10 pt-6 md:pt-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-xs md:text-sm text-gray-500 text-center md:text-left">
                © 2025 Ninh Kiều iSTORE. All rights reserved.
              </p>
              <div className="flex items-center gap-4 md:gap-6 text-xs md:text-sm">
                <a
                  href="/privacy"
                  className="text-gray-500 hover:text-white transition-colors duration-300"
                >
                  Chính Sách Bảo Mật
                </a>
                <a
                  href="/terms"
                  className="text-gray-500 hover:text-white transition-colors duration-300"
                >
                  Điều Khoản Sử Dụng
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
);

export default PublicFooter;

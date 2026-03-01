{
  description = "Tauri App Development Environment";

  inputs = {
    nixpkgs-linux.url = "github:nixos/nixpkgs/nixos-unstable";
    nixpkgs-darwin.url = "github:nixos/nixpkgs/nixos-24.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs-linux, nixpkgs-darwin, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        isLinux = builtins.match ".*linux.*" system != null;

        pkgs = import (if isLinux then nixpkgs-linux else nixpkgs-darwin) {
          inherit system;
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
        };

        inherit (pkgs) lib;

        pkgsUnstable = import nixpkgs-linux {
          inherit system;
          config.allowUnfree = true;
        };

        linuxLibraries = with pkgs; [
          webkitgtk_4_1
          gtk3
          cairo
          gdk-pixbuf
          glib
          dbus
          openssl
          librsvg
          libayatana-appindicator
          libsoup_3
          libcanberra-gtk3
          mesa
          glib-networking
          libpulseaudio
          alsa-lib
          libnice
        ];

        linuxGstreamer = with pkgs.gst_all_1; [
          gstreamer
          gst-plugins-base
          gst-plugins-good
          gst-plugins-bad
          gst-plugins-ugly
          gst-libav
        ];

        darwinFrameworks = with pkgs.darwin.apple_sdk.frameworks; [
          Security
          CoreServices
          CoreFoundation
          Foundation
          AppKit
          WebKit
        ] ++ [ pkgs.libiconv ];

        commonPackages = with pkgs; [
          rustup
          cargo
          cargo-tauri
          bun
          curl
          wget
          file
          gnumake
          binutils
          just
          pkg-config
          typescript
        ] ++ [
          pkgsUnstable.just
        ];

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = commonPackages
            ++ lib.optionals isLinux (linuxLibraries ++ linuxGstreamer)
            ++ lib.optionals (!isLinux) darwinFrameworks;

          nativeBuildInputs = with pkgs; [ pkg-config ]
            ++ lib.optionals isLinux [ wrapGAppsHook4 xdotool ];

          shellHook = ''
            # --- Linux Hooks (GStreamer / WebKit / Nvidia) ---
            ${lib.optionalString isLinux ''
              export LD_LIBRARY_PATH=/run/opengl-driver/lib:${lib.makeLibraryPath (linuxLibraries ++ linuxGstreamer)}:${pkgs.gst_all_1.gst-plugins-base}/lib:${pkgs.gst_all_1.gst-plugins-bad}/lib:${pkgs.mesa}/lib:${pkgs.libglvnd}/lib:$LD_LIBRARY_PATH

              export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules/"
              export GST_PLUGIN_SYSTEM_PATH_1_0=${pkgs.gst_all_1.gstreamer}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-base}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-good}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-bad}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-ugly}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-libav}/lib/gstreamer-1.0:${pkgs.libnice.out}/lib/gstreamer-1.0

              # GPU / WebRTC Workarounds
              if ! command -v nvidia-smi >/dev/null 2>&1; then
                  export WEBKIT_DISABLE_COMPOSITING_MODE=1
                  export WEBKIT_DISABLE_DMABUF_RENDERER=1
                  export LIBGL_ALWAYS_SOFTWARE=1
                  echo "Nvidia not detected."
              else
                  export WEBKIT_DISABLE_COMPOSITING_MODE=1
                  export WEBKIT_DISABLE_DMABUF_RENDERER=1
                  export LIBGL_ALWAYS_SOFTWARE=1
                  export WEBKIT_GST_DMABUF_SINK_ENABLED=0
                  echo "Nvidia detected: Disabling DMABuf sink."
              fi

              export GDK_BACKEND=x11
              export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$GSETTINGS_SCHEMAS_PATH:$XDG_DATA_DIRS"
            ''}
          '';
        };
      }
    );
}

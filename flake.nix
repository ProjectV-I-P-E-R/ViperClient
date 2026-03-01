{
  description = "Tauri App Development Environment";

  inputs = {
    nixpkgs-linux.url = "github:nixos/nixpkgs/nixos-unstable";
    nixpkgs-darwin.url = "github:nixos/nixpkgs/nixos-24.11";
    flake-utils.url = "github:numtide/flake-utils";
    nixgl.url = "github:nix-community/nixGL";
  };

  outputs = { self, nixpkgs-linux, nixpkgs-darwin, flake-utils, nixgl }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        isLinux = builtins.match ".*linux.*" system != null;

        pkgs = import (if isLinux then nixpkgs-linux else nixpkgs-darwin) {
          inherit system;
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
          overlays = [ nixgl.overlay ];
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
          libglvnd
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
            ++ lib.optionals isLinux [ wrapGAppsHook4 xdotool pkgs.nixgl.auto.nixGLNvidia ];

          shellHook = ''
            ${lib.optionalString isLinux ''
              export LD_LIBRARY_PATH=${lib.makeLibraryPath (linuxLibraries ++ linuxGstreamer)}:$LD_LIBRARY_PATH

              export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules/"

              export GST_PLUGIN_SYSTEM_PATH_1_0=${lib.concatMapStringsSep ":" (pkg: "${pkg}/lib/gstreamer-1.0") (with pkgs.gst_all_1; [
                gstreamer.out
                gst-plugins-base
                gst-plugins-good
                gst-plugins-bad
                gst-plugins-ugly
                gst-libav
              ] ++ [ pkgs.libnice ])}

              export GST_PLUGIN_PATH=$GST_PLUGIN_SYSTEM_PATH_1_0

              # Nvidia hardware acceleration
              export __GLX_VENDOR_LIBRARY_NAME=nvidia
              export __GL_GSYNC_ALLOWED=1
              export __GL_VRR_ALLOWED=1
              export LIBVA_DRIVER_NAME=nvidia
              export VDPAU_DRIVER=nvidia
              export LIBGL_ALWAYS_SOFTWARE=0
              export WEBKIT_FORCE_COMPOSITING_MODE=1
              export NVD_BACKEND=direct
              export GST_VAAPI_ALL_DRIVERS=1
              export WEBKIT_FORCE_SANDBOX=0
              export WEBKIT_DISABLE_COMPOSITING_MODE=0
              export WEBKIT_DISABLE_DMABUF_RENDERER=1

              export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$GSETTINGS_SCHEMAS_PATH:$XDG_DATA_DIRS"
            ''}
          '';

          env = {
            PROTOBUF_LOCATION = "${pkgs.protobuf}";
            PROTOC = "${pkgs.protobuf}/bin/protoc";
            PROTOC_INCLUDE = "${pkgs.protobuf}/include";
          };
        };
      }
    );
}
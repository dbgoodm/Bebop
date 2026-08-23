FROM node:22-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      curl \
      file \
      libasound2-dev \
      libappindicator3-dev \
      libgtk-3-dev \
      librsvg2-dev \
      libssl-dev \
      libwebkit2gtk-4.1-dev \
      patchelf \
      pkg-config \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/* \
    && curl --proto "=https" --tlsv1.2 --fail --silent --show-error \
      https://sh.rustup.rs | sh -s -- -y --profile minimal

ENV PATH="/root/.cargo/bin:${PATH}"

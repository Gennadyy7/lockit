FROM ubuntu:24.04 AS builder

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libssl-dev \
    pkg-config \
    libudev-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

RUN rustup default stable

RUN sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)" \
    && cp -r /root/.local/share/solana/install/active_release/bin/* /usr/local/bin/ \
    && export PATH="/usr/local/bin:$PATH"

RUN cargo install spl-token-cli

FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    libssl-dev \
    curl \
    git \
    nano \
    build-essential \
    pkg-config \
    libudev-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g ts-node typescript yarn @solana/spl-token @types/node

WORKDIR /app

COPY --from=builder /usr/local/bin/solana* /usr/local/bin/
COPY --from=builder /root/.rustup/ /root/.rustup/
COPY --from=builder /root/.cargo/ /root/.cargo/
COPY --from=builder /root/.local/ /root/.local/
COPY --from=builder /usr/local/bin/ /usr/local/bin/

ENV PATH="/root/.cargo/bin:/root/.local/bin:/usr/local/bin:${PATH}"
ENV PATH="/usr/local/bin:/root/.cargo/bin:/root/.local/bin:${PATH}"

RUN solana config set --url http://solana-validator:8899
RUN solana-keygen new --no-passphrase --outfile /root/.config/solana/id.json

RUN avm install latest && avm use latest

RUN anchor --version
RUN solana --version
RUN rustc --version
RUN cargo --version
RUN node --version
RUN npm --version

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8899 8900 8000-8009

ENTRYPOINT ["/entrypoint.sh"]
CMD ["tail", "-f", "/dev/null"]
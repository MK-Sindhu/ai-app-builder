FROM codercom/code-server:4.96.4

USER root
RUN apt-get update \
    && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Shared with the worker container, which writes the project files here.
# coder has uid 1000, the same as the worker's bun user, so both can edit the files.
RUN mkdir -p /tmp/bolty-worker && chown coder:coder /tmp/bolty-worker

# Revert to the code-server default user
USER coder
# Let that user install npm packages globally (e.g. @expo/ngrok for `npx expo start --tunnel`)
ENV NPM_CONFIG_PREFIX=/home/coder/.npm-global
ENV PATH=/home/coder/.npm-global/bin:$PATH
# Expose code-server's default port
EXPOSE 8080

# Start code-server on container launch. No login of its own: the router on the control server checks
# each user, and the security group only lets the control server reach port 8080.
CMD ["code-server", "--auth", "none", "--bind-addr", "0.0.0.0:8080", "/tmp/bolty-worker"]

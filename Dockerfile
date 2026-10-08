FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=4173 \
    CAMPUSIQ_DATA_DIR=/app/data

WORKDIR /app

COPY --chown=node:node package.json server.js index.html prototype.js demo-data.csv ./
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["npm", "start"]

import winston from 'winston'
import type { TransformableInfo } from 'logform'

const logFormat = winston.format.printf(
  ({ timestamp, level, message, ...meta }: TransformableInfo) => {
    const metaAsString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `${timestamp as string} ${level}: ${message as string}${metaAsString}`
  }
)

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), logFormat),
  transports: [new winston.transports.Console()]
})

export default logger

import dayjs, { Dayjs } from 'dayjs'
import * as csv from 'csv'
import chalk from 'chalk'

interface Message {
  aggregation_timestamp: number
  n_requests: number
  operation: string
  snapshot_id: string
  n_context: number
  n_context_tokens_total: number
  n_generated: number
  n_generated_tokens_total: number
}

interface Usage {
  object: string
  data: Message[]
  ft_data: any[]
  dalle_api_data: any[]
  whisper_api_data: any[]
  current_usage_usd: number
}

export async function downloadByDate(
  date: string,
  options: {
    authorization: string
    organization: string
  },
): Promise<Usage> {
  const resp = await fetch(`https://api.openai.com/v1/usage?date=${date}`, {
    headers: {
      accept: '*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja-JP;q=0.6,ja;q=0.5',
      authorization: options.authorization,
      'openai-organization': options.organization,
      'sec-ch-ua': '"Google Chrome";v="111", "Not(A:Brand";v="8", "Chromium";v="111"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
    },
    referrer: 'https://platform.openai.com/',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: null,
    method: 'GET',
  })
  if (!resp.ok) {
    throw new Error(resp.statusText)
  }
  return await resp.json()
}

function retry<T extends (...args: any[]) => Promise<any>>(fn: T, count: number): T {
  return ((...args) =>
    new Promise((resolve, reject) => {
      function attempt() {
        fn(...args)
          .then(resolve)
          .catch((error) => {
            if (count > 0) {
              count--
              console.log(chalk.red(`Error occurred (${error.message}). Retrying (${count} attempts left)...`))
              attempt()
              return
            }
            reject(new Error(`No more attempts to retry (${error.message})`))
          })
      }

      attempt()
    })) as T
}

export async function downloadUsage(options: {
  start: Dayjs
  end: Dayjs
  authorization: string
  organization: string
  callback: (date: string) => void
}) {
  if (options.start.isAfter(options.end)) {
    throw new Error('start date should be before end date')
  }
  const usage: Usage[] = []
  for (let date = options.start; date.isBefore(options.end); date = date.add(1, 'day')) {
    const s = date.format('YYYY-MM-DD')
    options.callback(s)
    try {
      usage.push(await retry(downloadByDate, 3)(s, options))
    } catch {
      throw new Error('download failed, please check your authorization and organization id')
    }
  }
  return usage
}

export function formatJson(usage: Usage[]): string {
  return JSON.stringify(usage, null, 2)
}

export async function formatCSV(usage: Usage[]): Promise<string> {
  const r = usage
    .flatMap((it) => it.data)
    .map((it) => [
      dayjs(it.aggregation_timestamp * 1000).toISOString(),
      it.n_requests,
      it.operation,
      it.snapshot_id,
      it.n_context,
      it.n_context_tokens_total,
      it.n_generated,
      it.n_generated_tokens_total,
    ])
  r.unshift([
    'aggregation_timestamp',
    'n_requests',
    'operation',
    'snapshot_id',
    'n_context',
    'n_context_tokens_total',
    'n_generated',
    'n_generated_tokens_total',
  ])
  return await new Promise((resolve, reject) =>
    csv.stringify(r, (err, output) => (err ? reject(err) : resolve(output))),
  )
}

export const formats = {
  json: formatJson,
  csv: formatCSV,
}
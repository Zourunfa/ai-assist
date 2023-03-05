import { observer, useLocalObservable, useObserver } from 'mobx-react-lite'
import css from './ChatView.module.css'
import classNames from 'classnames'
import ReactMarkdown from 'react-markdown'
import { safeLocalStorageGet } from '../../utils/safeLocalStorageGet'
import GPT3Tokenizer from 'gpt3-tokenizer'
import { pick } from 'lodash-es'
import { useEffect, useRef } from 'react'
import { useMount } from 'react-use'
import clipboardy from 'clipboardy'

function sliceMessages(messages: Pick<Message, 'role' | 'content'>[], max: number) {
  const tokenizer = new GPT3Tokenizer({ type: 'gpt3' })
  let sum = 0
  const r: Pick<Message, 'role' | 'content'>[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const it = messages[i]
    const count = tokenizer.encode(it.content).text.length
    if (sum + count > max) {
      return r
    }
    sum += count
    r.unshift(it)
  }
  return r
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const ChatMessage = observer((props: { message: Message }) => {
  return (
    <li className={css.message}>
      <span>{props.message.role === 'user' ? 'You' : 'Bot'}:</span>
      <div>
        <ReactMarkdown>{props.message.content}</ReactMarkdown>
      </div>
    </li>
  )
})

export const ChatView = observer(function () {
  const state = useLocalObservable(() => ({
    msg: '',
    messages: (safeLocalStorageGet('ai-assist-chat-history') ?? []) as Message[],
  }))
  useObserver(() => {
    localStorage.setItem('ai-assist-chat-history', JSON.stringify(state.messages))
  })

  const messagesRef = useRef<HTMLUListElement>(null)
  useMount(() => {
    messagesRef.current?.lastElementChild?.scrollIntoView({ behavior: 'auto' })
  })

  async function onSend() {
    const msg = state.msg
    state.messages.push({ id: Math.random().toString(), content: msg, role: 'user' })
    state.msg = ''
    await new Promise((resolve) => setTimeout(resolve, 0))
    messagesRef.current!.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    const list = sliceMessages(
      state.messages.map((it) => pick(it, 'role', 'content')),
      3000,
    )
    console.log('sendMessages ', list)
    const resp = await fetch('/api/chat-stream', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(list),
    })
    if (resp.status !== 200) {
      return
    }
    state.messages.push({ id: Math.random().toString(), content: '', role: 'assistant' })
    const m = state.messages[state.messages.length - 1]
    const reader = resp.body!.getReader()
    let chunk = await reader.read()
    const textDecoder = new TextDecoder()
    while (!chunk.done) {
      const s = textDecoder.decode(chunk.value)
      m.content += s
      messagesRef.current!.lastElementChild?.scrollIntoView({ behavior: 'auto' })
      chunk = await reader.read()
    }
  }

  async function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      event.currentTarget.tagName !== 'TEXTAREA' &&
      event.currentTarget.tagName !== 'INPUT'
    ) {
      if (state.msg.trim().length === 0) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      await onSend()
    }
  }
  function onInput(event: React.FormEvent<HTMLTextAreaElement>) {
    state.msg = event.currentTarget.value
  }

  function onClear() {
    state.messages = []
  }
  async function onCopy() {
    if (state.messages.length === 0) {
      window.alert('没有消息')
      return
    }
    const r = state.messages.map((it) => it.content).join('\n')
    await clipboardy.write(r)
    window.alert('复制成功')
  }

  return (
    <div className={classNames('container', css.chat)}>
      <ul className={css.messages} ref={messagesRef}>
        {state.messages.map((it) => (
          <ChatMessage key={it.id} message={it}></ChatMessage>
        ))}
      </ul>
      <footer>
        <div className={css.operations}>
          <button onClick={onClear}>清空</button>
          <button onClick={onCopy}>复制</button>
        </div>
        <div className={css.newMessage}>
          <textarea className={css.input} rows={1} value={state.msg} onInput={onInput} onKeyDown={onKeyDown}></textarea>
          <button onClick={onSend}>发送</button>
        </div>
      </footer>
    </div>
  )
})

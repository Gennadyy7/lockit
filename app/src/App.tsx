import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { useEffect, useState, useCallback } from 'react'
import idl from './idl.json' with { type: 'json' }
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Loader2, Lock, Unlock } from 'lucide-react'

const PROGRAM_ID = new PublicKey('CpigxAirimCC6o21ZnwQPfPQAXg8sXgyAaxtmV9Lc3wg')

// Защита от битого IDL
if (!idl || !Array.isArray((idl as any).accounts)) {
  throw new Error('IDL не загружен или повреждён. Перезапусти anchor build и скопируй idl.json заново.')
}

export default function App() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()
  const [vault, setVault] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState('30')
  const [amount, setAmount] = useState('0.5')

  const provider = new AnchorProvider(connection, window.solana as any, { commitment: 'processed' })
  const program = new Program(idl, PROGRAM_ID, provider)

  const [vaultPda] = publicKey
    ? PublicKey.findProgramAddressSync([Buffer.from('vault'), publicKey.toBuffer()], PROGRAM_ID)
    : [null]

  const fetchVault = useCallback(async () => {
    if (!publicKey || !vaultPda) return setVault(null)
    try {
      const v = await program.account.vault.fetchNullable(vaultPda)
      setVault(v)
    } catch (e) {
      console.error('Ошибка чтения vault:', e)
      setVault(null)
    }
  }, [publicKey, vaultPda, program])

  useEffect(() => {
    if (connected) fetchVault()
    const id = setInterval(fetchVault, 7000)
    return () => clearInterval(id)
  }, [connected, fetchVault])

  const create = async () => {
    setLoading(true)
    try {
      const tx = await program.methods.createVault(new BN(days))
        .accounts({ user: publicKey!, vault: vaultPda! })
        .transaction()
      await sendTransaction(tx, connection)
      await fetchVault()
    } catch (e: any) {
      alert('Ошибка создания: ' + (e.logs?.join('\n') || e.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  const deposit = async () => {
    setLoading(true)
    try {
      const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL)
      const tx = await program.methods.deposit(new BN(lamports))
        .accounts({ user: publicKey!, vault: vaultPda! })
        .transaction()
      await sendTransaction(tx, connection)
      await fetchVault()
    } catch (e: any) {
      alert('Ошибка пополнения: ' + (e.logs?.join('\n') || e.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  const withdraw = async () => {
    setLoading(true)
    try {
      const tx = await program.methods.withdraw()
        .accounts({ user: publicKey!, vault: vaultPda! })
        .transaction()
      await sendTransaction(tx, connection)
      await fetchVault()
    } catch (e: any) {
      alert('Ошибка вывода: ' + (e.logs?.join('\n') || e.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  const unlockDate = vault && new Date(vault.unlockTime.toNumber() * 1000)
  const unlocked = unlockDate && unlockDate <= new Date()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-black/50 backdrop-blur-xl rounded-3xl p-10 max-w-lg w-full shadow-2xl border border-purple-500/20">
        <h1 className="text-6xl font-bold text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          LockIt
        </h1>

        <div className="flex justify-center mb-8">
          <WalletMultiButton className="!bg-purple-600 !py-4 !px-8 !text-lg" />
        </div>

        {!connected ? (
          <p className="text-center text-gray-400 text-xl">Подключи Phantom</p>
        ) : !vault ? (
          <div className="text-center">
            <Lock className="w-24 h-24 mx-auto mb-8 text-purple-400" />
            <input
              type="number"
              min="1"
              max="365"
              value={days}
              onChange={e => setDays(e.target.value)}
              className="bg-gray-800 text-white px-8 py-5 rounded-2xl text-3xl w-40 mb-8 text-center"
            />
            <p className="text-gray-400 text-xl mb-8">Блокировка на {days} дней</p>
            <button onClick={create} disabled={loading}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-16 py-6 rounded-2xl text-2xl font-bold transition">
              {loading && <Loader2 className="inline animate-spin mr-3" />}
              Создать ячейку
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-7xl font-bold mb-6 text-white">
              {(vault.balance / LAMPORTS_PER_SOL).toFixed(4)} SOL
            </div>

            {unlocked ? (
              <p className="text-green-400 text-2xl mb-6 flex items-center justify-center">
                <Unlock className="w-10 h-10 mr-3" />Доступно для вывода!
              </p>
            ) : (
              <p className="text-orange-400 text-xl mb-6">
                Разблокируется {unlockDate && formatDistanceToNow(unlockDate, { locale: ru, addSuffix: true })}
              </p>
            )}

            <div className="grid grid-cols-2 gap-6 mt-10">
              <div>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="bg-gray-800 text-white px-6 py-4 rounded-xl w-full mb-4 text-xl"
                  placeholder="0.5"
                />
                <button onClick={deposit} disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 py-5 rounded-xl font-bold text-xl">
                  Пополнить
                </button>
              </div>
              <button onClick={withdraw} disabled={loading || !unlocked}
                className={`w-full py-5 rounded-xl font-bold text-xl ${unlocked ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 cursor-not-allowed'}`}>
                {unlocked ? 'Вывести всё' : 'Заблокировано'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

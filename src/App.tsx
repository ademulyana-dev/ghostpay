import React, { useState, useEffect, useCallback, Component } from 'react';
import { ethers } from 'ethers';
import { Ghost, Send, Download, RotateCcw, Search, Coins, Wallet, ExternalLink, Copy, CheckCircle2, AlertCircle, Clock, ArrowRight, ShieldCheck, Info, Loader2, Menu, X, History, BookOpen, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Sanitize localStorage at the top level to prevent "undefined" is not valid JSON errors
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key);
        if (val === "undefined" || val === "null") {
          localStorage.removeItem(key);
          i--; // Adjust index after removal
        }
      }
    }
  } catch (e) {
    console.error("Failed to sanitize localStorage", e);
  }
}

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 p-8 max-w-md w-full text-center">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-8 leading-relaxed">
              An unexpected error occurred. Please try refreshing the page or clearing your browser cache.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-gray-900 text-white font-bold rounded-2xl py-4 hover:bg-black transition-all"
            >
              Refresh Page
            </button>
            {this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Error details</summary>
                <pre className="mt-2 p-4 bg-gray-50 rounded-xl text-[10px] font-mono text-gray-500 overflow-auto max-h-40">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (str === null || str === undefined) return fallback;
  if (typeof str !== 'string') return fallback;
  const trimmed = str.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null" || trimmed === "[object Object]") return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch (e) {
    console.error("JSON parse error for:", trimmed, e);
    return fallback;
  }
}

async function safeFetchJson(res: Response, fallback: any = { status: "0", result: [] }) {
  try {
    const text = await res.text();
    if (!text || text.trim() === "" || text.trim() === "undefined" || text.trim() === "null") return fallback;
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

const CONTRACT_ADDRESS = "0x7906715ad6B8De952AbC35D00C6149E4AcEcA604";
const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const CHAIN_ID = 11155111;
const EXPLORER_URL = "https://eth-sepolia.blockscout.com";
const ETH_ADDR = "0x0000000000000000000000000000000000000000";

const ABI = [
  "function a3f8c2d1(bytes32 commitment, address token, uint256 amount, uint256 cancelDelay) external",
  "function e1b5f9c3(bytes32 commitment, uint256 cancelDelay) external payable",
  "function d7a2c4f8(bytes32 commitment, bytes32 nullifier, address token, uint256 amount, bytes calldata signature) external",
  "function f4e9b1a6(bytes32 commitment) external",
  "function e4c8a3f1() external view returns (address[] memory addrs, string[] memory symbols)",
  "function b9f2d7c1(bytes32 commitment) external view returns (bool exists, address token, uint256 amount, bool claimed, bool cancelled, uint256 deadline)",
  "event e8a3f1b2(bytes32 indexed commitment, address indexed token, uint256 amount, uint256 deadline)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

type Token = { address: string, symbol: string, decimals: number };

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('send');
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [address, setAddress] = useState<string>('');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{msg: React.ReactNode, type: 'success'|'error'|'info'} | null>(null);

  const showToast = (msg: React.ReactNode, type: 'success'|'error'|'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === 'error' ? 6000 : 4000);
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      showToast("MetaMask not found", "error");
      return;
    }
    try {
      const p = new ethers.BrowserProvider(window.ethereum as any);
      const n = await p.getNetwork();
      if (Number(n.chainId) !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }] // Sepolia 11155111
          });
        } catch {
          showToast("Please switch to Sepolia", "error");
          return;
        }
      }
      const s = await p.getSigner();
      const a = await s.getAddress();
      setProvider(p);
      setSigner(s);
      setAddress(a);
      showToast("Wallet connected!", "success");
    } catch (e: any) {
      showToast(e.message || "Connection failed", "error");
    }
  };

  useEffect(() => {
    const loadTokens = async () => {
      try {
        const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, rpcProvider);
        const res = await contract.e4c8a3f1();
        const addrs = res[0];
        const symbols = res[1];
        const loadedTokens: Token[] = [];
        
        for (let i = 0; i < addrs.length; i++) {
          let decimals = 18;
          if (addrs[i] !== ETH_ADDR) {
             try {
               const t = new ethers.Contract(addrs[i], ERC20_ABI, rpcProvider);
               decimals = Number(await t.decimals());
             } catch { decimals = 18; }
          }
          loadedTokens.push({ address: addrs[i], symbol: symbols[i], decimals });
        }
        setTokens(loadedTokens);
      } catch (e) {
        console.error("Failed to load tokens", e);
      }
    };
    loadTokens();
  }, []);

  useEffect(() => {
    const fetchBalances = async () => {
      if (!address || !provider || tokens.length === 0) return;
      
      const newBalances: Record<string, string> = {};
      
      for (const t of tokens) {
        try {
          if (t.address === ETH_ADDR) {
            const bal = await provider.getBalance(address);
            newBalances[t.address] = ethers.formatEther(bal);
          } else {
            const contract = new ethers.Contract(t.address, ERC20_ABI, provider);
            const bal = await contract.balanceOf(address);
            newBalances[t.address] = ethers.formatUnits(bal, t.decimals);
          }
        } catch (e) {
          console.error(`Failed to fetch balance for ${t.symbol}`, e);
          newBalances[t.address] = "0";
        }
      }
      
      setBalances(newBalances);
    };
    
    fetchBalances();
  }, [address, provider, tokens]);

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-gray-900 font-sans selection:bg-orange-100 selection:text-orange-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col fixed inset-y-0 left-0 z-40">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#ff3300] rounded-lg flex items-center justify-center text-white shadow-sm">
            <Ghost className="w-5 h-5" />
          </div>
          <span className="text-xl font-extrabold tracking-tight">Ghost<span className="text-[#ff3300]">Pay</span></span>
        </div>
        
        <nav className="flex-1 px-4 py-2 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 py-2 mt-2">Transfer</div>
          <NavButton id="send" icon={Send} label="Send" active={activeTab} set={setActiveTab} />
          <NavButton id="receive" icon={Download} label="Receive" active={activeTab} set={setActiveTab} />
          
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 py-2 mt-4">Manage</div>
          <NavButton id="history" icon={History} label="History" active={activeTab} set={setActiveTab} />
          <NavButton id="cancel" icon={RotateCcw} label="Cancel & Refund" active={activeTab} set={setActiveTab} />
          <NavButton id="status" icon={Search} label="Check Status" active={activeTab} set={setActiveTab} />
          
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 py-2 mt-4">Info</div>
          <NavButton id="tokens" icon={Coins} label="Supported Tokens" active={activeTab} set={setActiveTab} />
          <NavButton id="docs" icon={BookOpen} label="Documentation" active={activeTab} set={setActiveTab} />
        </nav>

        {/* Pixel Art Graphic */}
        <div className="p-6 mt-auto">
          <div className="w-full flex flex-col gap-[2px] opacity-80">
            {[
              [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
              [0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0],
              [0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0],
              [0,0,0,0,0,0,0,1,0,0,1,2,2,1,0,0],
              [0,0,0,0,0,1,1,2,1,1,2,3,2,1,0,0],
              [0,0,0,1,1,2,3,3,2,2,3,3,2,1,1,0],
              [0,1,1,2,3,3,4,4,3,3,4,3,2,2,1,1],
              [1,2,3,4,4,4,4,4,4,4,4,4,3,2,2,1]
            ].map((row, i) => (
              <div key={i} className="flex gap-[2px] w-full">
                {row.map((val, j) => {
                  const colors = [
                    ['transparent', 'transparent'],
                    ['#fed7aa', '#ffedd5'],
                    ['#fb923c', '#fcd34d'],
                    ['#ea580c', '#f59e0b'],
                    ['#ff3300', '#ea580c']
                  ];
                  return (
                    <motion.div 
                      key={j} 
                      className="flex-1 aspect-square rounded-[1px]" 
                      animate={{ backgroundColor: colors[val] }}
                      transition={{ duration: 0.5 + Math.random() * 0.8, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#ff3300] rounded-lg flex items-center justify-center text-white shadow-sm">
            <Ghost className="w-5 h-5" />
          </div>
          <span className="text-lg font-extrabold tracking-tight">Ghost<span className="text-[#ff3300]">Pay</span></span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-gray-500">
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-0 top-16 bg-white z-40 flex flex-col"
          >
            <nav className="p-4 flex flex-col gap-1 overflow-y-auto">
              <NavButton id="send" icon={Send} label="Send" active={activeTab} set={setActiveTab} close={() => setIsMobileMenuOpen(false)} />
              <NavButton id="receive" icon={Download} label="Receive" active={activeTab} set={setActiveTab} close={() => setIsMobileMenuOpen(false)} />
              <div className="h-px bg-gray-100 my-2" />
              <NavButton id="history" icon={History} label="History" active={activeTab} set={setActiveTab} close={() => setIsMobileMenuOpen(false)} />
              <NavButton id="cancel" icon={RotateCcw} label="Cancel & Refund" active={activeTab} set={setActiveTab} close={() => setIsMobileMenuOpen(false)} />
              <NavButton id="status" icon={Search} label="Check Status" active={activeTab} set={setActiveTab} close={() => setIsMobileMenuOpen(false)} />
              <div className="h-px bg-gray-100 my-2" />
              <NavButton id="tokens" icon={Coins} label="Supported Tokens" active={activeTab} set={setActiveTab} close={() => setIsMobileMenuOpen(false)} />
              <NavButton id="docs" icon={BookOpen} label="Documentation" active={activeTab} set={setActiveTab} close={() => setIsMobileMenuOpen(false)} />
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 flex flex-col min-h-screen pt-16 md:pt-0">
        {/* Topbar (Desktop) */}
        <header className="h-20 hidden md:flex items-center justify-end px-8 sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="bg-orange-50 text-[#ff3300] text-[11px] font-bold px-3 py-1.5 rounded-full border border-orange-200 font-mono tracking-wider">SEPOLIA</span>
            <button 
              onClick={connectWallet}
              className="bg-[#ff3300] hover:bg-[#e62e00] text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm"
            >
              <Wallet className="w-4 h-4" />
              {address ? `${address.slice(0,6)}...${address.slice(-4)}` : 'Connect Wallet'}
            </button>
          </div>
        </header>

        {/* Mobile Connect Button */}
        <div className="md:hidden p-4 flex justify-end">
          <button 
            onClick={connectWallet}
            className="bg-[#ff3300] hover:bg-[#e62e00] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm shadow-sm"
          >
            <Wallet className="w-4 h-4" />
            {address ? `${address.slice(0,6)}...${address.slice(-4)}` : 'Connect Wallet'}
          </button>
        </div>

        {/* Tab Content Container */}
        <div className={cn("flex-1 flex", (activeTab === 'docs' || activeTab === 'history') ? "flex-col" : "items-center justify-center p-4 sm:p-8")}>
          <div className={cn("w-full", (activeTab === 'docs' || activeTab === 'history') ? "max-w-none flex-1 flex flex-col" : "max-w-[520px]")}>
            <AnimatePresence mode="wait">
              {activeTab === 'send' && <SendTab key="send" tokens={tokens} balances={balances} signer={signer} address={address} provider={provider} showToast={showToast} />}
              {activeTab === 'receive' && <ReceiveTab key="receive" tokens={tokens} signer={signer} address={address} showToast={showToast} />}
              {activeTab === 'history' && <HistoryTab key="history" address={address} tokens={tokens} />}
              {activeTab === 'cancel' && <CancelTab key="cancel" tokens={tokens} signer={signer} address={address} showToast={showToast} />}
              {activeTab === 'status' && <StatusTab key="status" tokens={tokens} showToast={showToast} />}
              {activeTab === 'tokens' && <TokensTab key="tokens" tokens={tokens} balances={balances} address={address} />}
              {activeTab === 'docs' && <DocsTab key="docs" />}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={cn(
              "fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl shadow-xl border flex items-center gap-3 font-medium text-sm max-w-sm",
              toast.type === 'success' ? "bg-green-50 text-green-800 border-green-200" :
              toast.type === 'error' ? "bg-red-50 text-red-800 border-red-200" :
              "bg-white text-gray-800 border-gray-200"
            )}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
            <span className="flex-1">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavButton({ id, icon: Icon, label, active, set, close }: any) {
  const isActive = active === id;
  return (
    <button 
      onClick={() => { set(id); if(close) close(); }}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-left w-full",
        isActive 
          ? "bg-[#ff3300]/10 text-[#ff3300]" 
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      <Icon className={cn("w-5 h-5", isActive ? "text-[#ff3300]" : "text-gray-400")} />
      {label}
    </button>
  );
}

// -----------------------------------------------------------------------------
// SEND TAB
// -----------------------------------------------------------------------------
function SendTab({ tokens, balances, signer, address, provider, showToast }: any) {
  const [step, setStep] = useState(1);
  const [token, setToken] = useState('');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [delay, setDelay] = useState('86400');
  const [secret, setSecret] = useState('');
  const [commitment, setCommitment] = useState('');
  const [nullifier, setNullifier] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [estimatedGasFee, setEstimatedGasFee] = useState<string | null>(null);
  const [estimatingGas, setEstimatingGas] = useState(false);

  const selectedToken = tokens.find((t: any) => t.address === token);
  const isETH = token === ETH_ADDR;
  const currentBalance = balances[token] || '0';

  useEffect(() => {
    const estimateGas = async () => {
      if (step !== 2 || !signer || !provider || !amount || isNaN(Number(amount))) return;
      setEstimatingGas(true);
      try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
        const amt = ethers.parseUnits(amount, selectedToken?.decimals || 18);
        const dly = Number(delay);
        
        let estimatedGas;
        if (isETH) {
          estimatedGas = await contract.e1b5f9c3.estimateGas(commitment, dly, { value: amt });
        } else {
          if (!isApproved) {
            setEstimatedGasFee('Requires Approval');
            setEstimatingGas(false);
            return;
          }
          estimatedGas = await contract.a3f8c2d1.estimateGas(commitment, token, amt, dly);
        }
        
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
        const totalFee = BigInt(estimatedGas) * BigInt(gasPrice);
        setEstimatedGasFee(ethers.formatEther(totalFee));
      } catch (e) {
        console.error("Gas estimation failed", e);
        setEstimatedGasFee('Unknown');
      } finally {
        setEstimatingGas(false);
      }
    };
    estimateGas();
  }, [step, isApproved, signer, provider, isETH, amount, selectedToken, delay, commitment, token]);

  useEffect(() => {
    const checkAllowance = async () => {
      if (!signer || !token || isETH || !amount || isNaN(Number(amount))) return;
      try {
        const t = new ethers.Contract(token, ERC20_ABI, signer);
        const al = await t.allowance(address, CONTRACT_ADDRESS);
        const amt = ethers.parseUnits(amount, selectedToken?.decimals || 18);
        setIsApproved(al >= amt);
      } catch (e) {
        console.error(e);
      }
    };
    checkAllowance();
  }, [token, amount, signer, address, isETH, selectedToken]);

  const handleGenerate = () => {
    if (!signer) return showToast("Connect wallet first", "error");
    if (!token) return showToast("Select a token", "error");
    if (!amount || Number(amount) <= 0) return showToast("Enter a valid amount", "error");
    if (Number(amount) > Number(currentBalance)) return showToast("Insufficient balance", "error");
    if (!recipient || !ethers.isAddress(recipient)) return showToast("Enter a valid recipient address", "error");
    
    try {
      const sec = ethers.hexlify(ethers.randomBytes(32));
      const amt = ethers.parseUnits(amount, selectedToken?.decimals || 18);
      const com = ethers.solidityPackedKeccak256(
        ["bytes32", "address", "address", "uint256"],
        [sec, recipient, token, amt]
      );
      const nul = ethers.solidityPackedKeccak256(["bytes32", "string"], [com, "nullifier"]);
      
      setSecret(sec);
      setCommitment(com);
      setNullifier(nul);
      setStep(2);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  const handleApprove = async () => {
    if (!signer) return;
    setIsApproving(true);
    try {
      const t = new ethers.Contract(token, ERC20_ABI, signer);
      const tx = await t.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
      showToast("Approval sent...", "info");
      await tx.wait();
      setIsApproved(true);
      showToast("Approved!", "success");
    } catch (e: any) {
      console.error("Approval error:", e);
      let errorMsg = "Approval failed";
      if (e.code === 'ACTION_REJECTED') errorMsg = "User rejected the transaction";
      else if (e.message?.includes("insufficient funds")) errorMsg = "Insufficient funds for gas";
      else if (e.reason) errorMsg = `Approval failed: ${e.reason}`;
      
      showToast(errorMsg, "error");
    } finally {
      setIsApproving(false);
    }
  };

  const handleDeposit = async () => {
    if (!signer) return;
    setIsDepositing(true);
    let currentTxHash = '';
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const amt = ethers.parseUnits(amount, selectedToken?.decimals || 18);
      const dly = Number(delay);
      
      let tx;
      if (isETH) {
        tx = await contract.e1b5f9c3(commitment, dly, { value: amt });
      } else {
        tx = await contract.a3f8c2d1(commitment, token, amt, dly);
      }
      currentTxHash = tx.hash;
      showToast("Transaction sent...", "info");
      const r = await tx.wait();
      setTxHash(r.hash);
      
      // Save to local storage for immediate Cancel tab detection
      try {
        const key = `ghostpay_deposits_${address.toLowerCase()}`;
        const raw = localStorage.getItem(key);
        let stored = safeJsonParse(raw, []);
        if (!Array.isArray(stored)) stored = [];
        if (!stored.includes(commitment)) {
          stored.push(commitment);
          localStorage.setItem(key, JSON.stringify(stored));
        }
      } catch (e) {
        console.error("Failed to save deposit locally", e);
      }
      
      setStep(3);
      showToast("Deposit successful!", "success");
    } catch (e: any) {
      console.error("Deposit error:", e);
      let errorMsg = "Deposit failed";
      if (e.code === 'ACTION_REJECTED') errorMsg = "User rejected the transaction";
      else if (e.message?.includes("insufficient funds")) errorMsg = "Insufficient funds for gas";
      else if (e.reason) errorMsg = `Deposit failed: ${e.reason}`;

      if (currentTxHash || e.hash) {
        const hash = currentTxHash || e.hash;
        showToast(
          <div className="flex flex-col gap-1">
            <span>{errorMsg}</span>
            <a 
              href={`${EXPLORER_URL}/tx/${hash}`} 
              target="_blank" 
              rel="noreferrer"
              className="text-xs underline flex items-center gap-1 opacity-80 hover:opacity-100"
            >
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
          </div>,
          "error"
        );
      } else {
        showToast(errorMsg, "error");
      }
    } finally {
      setIsDepositing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard", "success");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Send</h2>

        {/* Progress Steps */}
        <div className="flex gap-2 mb-8">
          <div className={cn("h-1.5 flex-1 rounded-full transition-colors", step >= 1 ? "bg-[#ff3300]" : "bg-gray-100")} />
          <div className={cn("h-1.5 flex-1 rounded-full transition-colors", step >= 2 ? "bg-[#ff3300]" : "bg-gray-100")} />
          <div className={cn("h-1.5 flex-1 rounded-full transition-colors", step >= 3 ? "bg-[#ff3300]" : "bg-gray-100")} />
        </div>

        {step === 1 && (
          <>
            {/* Amount & Token Block */}
            <div className="bg-[#f9f9f9] rounded-2xl p-4 border border-gray-200 mb-4 transition-colors focus-within:border-orange-300 focus-within:bg-white">
              <div className="flex justify-between text-sm text-gray-500 mb-2 font-medium">
                <span>Amount</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <input 
                  type="number" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  placeholder="0"
                  className="bg-transparent text-4xl font-medium outline-none w-full text-gray-900 placeholder-gray-300"
                />
                <div className="shrink-0">
                  <select 
                    value={token} 
                    onChange={e => setToken(e.target.value)}
                    className="bg-white border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-[#ff3300] focus:border-[#ff3300] block p-3 font-bold shadow-sm cursor-pointer appearance-none pr-8 relative"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
                  >
                    <option value="" disabled>Select Token</option>
                    {tokens.map((t: any) => (
                      <option key={t.address} value={t.address}>{t.symbol}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-between text-sm text-gray-500 mt-3 font-medium">
                <span className={token ? "opacity-100" : "opacity-0"}>$ 0.00</span>
                {token ? (
                  <span>Balance: <button onClick={() => setAmount(currentBalance)} className="text-[#ff3300] font-bold hover:underline">{Number(currentBalance).toFixed(4)}</button></span>
                ) : (
                  <span className="opacity-0">Balance: 0.0000</span>
                )}
              </div>
            </div>

            {/* Recipient Block */}
            <div className="bg-[#f9f9f9] rounded-2xl p-4 border border-gray-200 mb-4 transition-colors focus-within:border-orange-300 focus-within:bg-white">
              <div className="flex justify-between text-sm text-gray-500 mb-2 font-medium">
                <span>Recipient Address</span>
              </div>
              <input 
                type="text" 
                value={recipient} 
                onChange={e => setRecipient(e.target.value)} 
                placeholder="0x..."
                className="bg-transparent text-lg font-mono outline-none w-full text-gray-900 placeholder-gray-300"
              />
            </div>

            {/* Delay Block */}
            <div className="bg-[#f9f9f9] rounded-2xl p-4 border border-gray-200 mb-6 transition-colors focus-within:border-orange-300 focus-within:bg-white">
              <div className="flex justify-between text-sm text-gray-500 mb-2 font-medium">
                <span>Refund Delay</span>
              </div>
              <select 
                value={delay} 
                onChange={e => setDelay(e.target.value)}
                className="bg-transparent text-lg font-medium outline-none w-full text-gray-900 cursor-pointer appearance-none"
              >
                <option value="3600">1 Hour</option>
                <option value="21600">6 Hours</option>
                <option value="43200">12 Hours</option>
                <option value="86400">1 Day</option>
                <option value="259200">3 Days</option>
                <option value="604800">7 Days</option>
                <option value="2592000">30 Days (max)</option>
              </select>
            </div>

            <button 
              onClick={handleGenerate}
              className="w-full bg-[#ff3300] hover:bg-[#e62e00] text-white font-bold rounded-2xl text-lg px-8 py-4 text-center transition-all shadow-sm flex justify-center items-center gap-2"
            >
              Generate Secret Code
            </button>
          </>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-6 h-6 text-[#ff3300] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-orange-900 font-bold mb-1 text-lg">Save your Secret Code</h3>
                  <p className="text-orange-800/80 text-sm leading-relaxed">
                    Send the <strong>Secret Code</strong> and <strong>Commitment Hash</strong> to your recipient via a private channel. They will need both to claim the funds.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">① Secret Code (Send to recipient)</label>
                <div 
                  onClick={() => copyToClipboard(secret)}
                  className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:border-[#ff3300] transition-colors group shadow-sm"
                >
                  <span className="font-mono text-sm text-[#ff3300] break-all pr-4">{secret}</span>
                  <div className="flex items-center gap-2 text-gray-400 group-hover:text-[#ff3300] shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Copy</span>
                    <Copy className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">② Commitment Hash (Send to recipient & save for refund)</label>
                <div 
                  onClick={() => copyToClipboard(commitment)}
                  className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:border-[#ff3300] transition-colors group shadow-sm"
                >
                  <span className="font-mono text-sm text-gray-600 break-all pr-4">{commitment}</span>
                  <div className="flex items-center gap-2 text-gray-400 group-hover:text-[#ff3300] shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Copy</span>
                    <Copy className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">③ Nullifier (Save securely)</label>
                <div 
                  onClick={() => copyToClipboard(nullifier)}
                  className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:border-[#ff3300] transition-colors group shadow-sm"
                >
                  <span className="font-mono text-sm text-gray-600 break-all pr-4">{nullifier}</span>
                  <div className="flex items-center gap-2 text-gray-400 group-hover:text-[#ff3300] shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Copy</span>
                    <Copy className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-4">
              {!isETH && !isApproved && (
                <button 
                  onClick={handleApprove} disabled={isApproving}
                  className="w-full bg-white border-2 border-gray-200 text-gray-900 hover:border-[#ff3300] hover:text-[#ff3300] font-bold rounded-2xl text-lg px-8 py-4 text-center transition-all flex justify-center items-center gap-2 disabled:opacity-50 shadow-sm"
                >
                  {isApproving ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Approve Token Spending'}
                </button>
              )}
              
              <div className="flex justify-between items-center px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-sm font-bold text-gray-500">Estimated Gas Fee</span>
                <span className="text-sm font-mono text-gray-900 flex items-center gap-2">
                  {estimatingGas ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : estimatedGasFee ? (
                    estimatedGasFee === 'Requires Approval' ? (
                      <span className="text-amber-600 text-xs font-sans">Requires Approval</span>
                    ) : estimatedGasFee === 'Unknown' ? (
                      <span className="text-gray-400 font-sans">Unknown</span>
                    ) : (
                      `~${Number(estimatedGasFee).toFixed(6)} ETH`
                    )
                  ) : (
                    '-'
                  )}
                </span>
              </div>

              <button 
                onClick={handleDeposit} disabled={isDepositing || (!isETH && !isApproved)}
                className="w-full bg-[#ff3300] text-white hover:bg-[#e62e00] font-bold rounded-2xl text-lg px-8 py-4 text-center transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:bg-gray-300 shadow-sm"
              >
                {isDepositing ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Confirm Deposit'}
              </button>
              <button onClick={() => setStep(1)} className="w-full py-3 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors">
                ← Back to Edit
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-10">
            <div className="w-24 h-24 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
            <h2 className="text-3xl font-extrabold mb-3 text-gray-900">Deposit Successful!</h2>
            <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">Your tokens are securely locked. Send the secret code and commitment hash to your recipient.</p>
            
            <a 
              href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-xl font-mono text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all mb-8 shadow-sm"
            >
              View on Explorer <ExternalLink className="w-4 h-4" />
            </a>

            <div className="space-y-4 mb-8 text-left">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Secret Code</label>
                <div className="flex items-center justify-between gap-3">
                  <code className="font-mono text-xs text-[#ff3300] break-all bg-white px-3 py-2 rounded-lg border border-gray-100 flex-1">{secret}</code>
                  <button 
                    onClick={() => copyToClipboard(secret)}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:border-[#ff3300] hover:text-[#ff3300] transition-all shadow-sm shrink-0"
                    title="Copy Secret Code"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Commitment Hash</label>
                <div className="flex items-center justify-between gap-3">
                  <code className="font-mono text-xs text-gray-600 break-all bg-white px-3 py-2 rounded-lg border border-gray-100 flex-1">{commitment}</code>
                  <button 
                    onClick={() => copyToClipboard(commitment)}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:border-[#ff3300] hover:text-[#ff3300] transition-all shadow-sm shrink-0"
                    title="Copy Commitment Hash"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Nullifier</label>
                <div className="flex items-center justify-between gap-3">
                  <code className="font-mono text-xs text-gray-600 break-all bg-white px-3 py-2 rounded-lg border border-gray-100 flex-1">{nullifier}</code>
                  <button 
                    onClick={() => copyToClipboard(nullifier)}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:border-[#ff3300] hover:text-[#ff3300] transition-all shadow-sm shrink-0"
                    title="Copy Nullifier"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <button 
              onClick={() => { setStep(1); setAmount(''); setSecret(''); setCommitment(''); }}
              className="w-full bg-gray-900 text-white hover:bg-black font-bold rounded-xl text-lg px-8 py-4 text-center transition-all shadow-sm"
            >
              Send Another Transfer
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// RECEIVE TAB
// -----------------------------------------------------------------------------
function ReceiveTab({ tokens, signer, address, showToast }: any) {
  const [secret, setSecret] = useState('');
  const [commitmentInput, setCommitmentInput] = useState('');
  const [deposit, setDeposit] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [estimatedGasFee, setEstimatedGasFee] = useState<string | null>(null);
  const [estimatingGas, setEstimatingGas] = useState(false);

  useEffect(() => {
    const estimateGas = async () => {
      if (!deposit || !signer || deposit.claimed || deposit.cancelled || !deposit.walletMatch) return;
      setEstimatingGas(true);
      try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
        const cleanSecret = secret.trim();
        const cleanCommitment = commitmentInput.trim();
        const nullifier = ethers.solidityPackedKeccak256(["bytes32", "string"], [cleanCommitment, "nullifier"]);
        
        const estimatedGas = await contract.d7a2c4f8.estimateGas(cleanSecret, nullifier);
        
        const feeData = await signer.provider.getFeeData();
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
        const totalFee = BigInt(estimatedGas) * BigInt(gasPrice);
        setEstimatedGasFee(ethers.formatEther(totalFee));
      } catch (e) {
        console.error("Gas estimation failed", e);
        setEstimatedGasFee('Unknown');
      } finally {
        setEstimatingGas(false);
      }
    };
    estimateGas();
  }, [deposit, signer, secret, commitmentInput]);

  const handleScan = async () => {
    const cleanSecret = secret.trim();
    const cleanCommitment = commitmentInput.trim();
    
    if (!cleanSecret || !ethers.isHexString(cleanSecret, 32)) return showToast("Invalid secret code format.", "error");
    if (!cleanCommitment || !ethers.isHexString(cleanCommitment, 32)) return showToast("Invalid commitment hash format.", "error");
    if (!address) return showToast("Connect wallet first", "error");
    
    setLoading(true);
    setDeposit(null);
    setTxHash('');
    try {
      const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, rpcProvider);
      
      const status = await contract.b9f2d7c1(cleanCommitment);

      if (!status[0]) {
        showToast("Deposit not found. Please check your commitment hash.", "error");
        return;
      }

      const tokenObj = tokens.find((t: any) => t.address.toLowerCase() === status[1].toLowerCase());
      const symbol = tokenObj ? tokenObj.symbol : 'Unknown Token';
      const decimals = tokenObj ? tokenObj.decimals : 18;
      
      // Verify wallet matches
      const expectedCmt = ethers.solidityPackedKeccak256(
        ["bytes32", "address", "address", "uint256"],
        [cleanSecret, address, status[1], status[2]]
      );
      
      const walletMatch = expectedCmt.toLowerCase() === cleanCommitment.toLowerCase();

      setDeposit({
        commitment: cleanCommitment,
        token: status[1],
        symbol,
        amount: status[2],
        formattedAmount: ethers.formatUnits(status[2], decimals),
        claimed: status[3],
        cancelled: status[4],
        deadline: Number(status[5]) * 1000,
        walletMatch
      });
      
      if (!walletMatch) {
        showToast("Wallet mismatch. Please switch to the correct recipient wallet.", "error");
      } else {
        showToast("Deposit found! Ready to claim.", "success");
      }
    } catch (e: any) {
      showToast(e.message || "Failed to scan", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!signer || !deposit) return;
    if (!deposit.walletMatch) return showToast("Wrong wallet connected.", "error");
    
    setClaiming(true);
    try {
      const nullifier = ethers.solidityPackedKeccak256(["bytes32", "string"], [deposit.commitment, "nullifier"]);
      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "address", "uint256"],
        [deposit.commitment, nullifier, deposit.token, deposit.amount]
      );
      const messageHashBytes = ethers.getBytes(messageHash);
      const signature = await signer.signMessage(messageHashBytes);

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.d7a2c4f8(deposit.commitment, nullifier, deposit.token, deposit.amount, signature);
      showToast("Transaction sent...", "info");
      const r = await tx.wait();
      setTxHash(r.hash);
      setDeposit({ ...deposit, claimed: true });
      showToast("Tokens claimed successfully!", "success");
    } catch (e: any) {
      showToast(e.reason || e.message || "Claim failed", "error");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Receive</h2>

        {!txHash ? (
          <div className="space-y-4">
            {/* Secret Code Block */}
            <div className="bg-[#f9f9f9] rounded-2xl p-4 border border-gray-200 transition-colors focus-within:border-orange-300 focus-within:bg-white mb-4">
              <div className="flex justify-between text-sm text-gray-500 mb-2 font-medium">
                <span>Secret Code (from sender)</span>
              </div>
              <input 
                type="text" 
                value={secret} 
                onChange={e => setSecret(e.target.value)} 
                placeholder="0x..."
                className="bg-transparent text-lg font-mono outline-none w-full text-gray-900 placeholder-gray-300"
              />
            </div>

            {/* Commitment Hash Block */}
            <div className="bg-[#f9f9f9] rounded-2xl p-4 border border-gray-200 transition-colors focus-within:border-orange-300 focus-within:bg-white mb-6">
              <div className="flex justify-between text-sm text-gray-500 mb-2 font-medium">
                <span>Commitment Hash (from sender)</span>
              </div>
              <input 
                type="text" 
                value={commitmentInput} 
                onChange={e => setCommitmentInput(e.target.value)} 
                placeholder="0x..."
                className="bg-transparent text-lg font-mono outline-none w-full text-gray-900 placeholder-gray-300"
              />
            </div>
            
            <button 
              onClick={handleScan} 
              disabled={loading || !secret || !commitmentInput || !address}
              className="w-full bg-[#ff3300] hover:bg-[#e62e00] text-white font-bold rounded-2xl text-lg px-8 py-4 text-center transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Find Deposit'}
            </button>
            
            {!address && <p className="text-sm text-red-500 mt-2 font-medium px-2">Please connect your wallet to continue.</p>}

            {deposit && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden pt-4">
                <div className="bg-orange-50 rounded-2xl border border-orange-100 overflow-hidden mb-6 shadow-sm">
                  <div className="flex justify-between items-center p-4 border-b border-orange-100/50">
                    <span className="text-sm font-bold text-orange-800/60">Token</span>
                    <span className="font-bold text-orange-900">{deposit.symbol}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 border-b border-orange-100/50">
                    <span className="text-sm font-bold text-orange-800/60">Amount</span>
                    <span className="font-extrabold text-[#ff3300] text-xl">{deposit.formattedAmount}</span>
                  </div>
                  <div className="flex justify-between items-center p-4">
                    <span className="text-sm font-bold text-orange-800/60">Status</span>
                    {deposit.claimed ? <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-200">Claimed</span> :
                     deposit.cancelled ? <span className="text-xs font-bold bg-red-100 text-red-700 px-3 py-1.5 rounded-full border border-red-200">Cancelled</span> :
                     <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200">Ready to Claim</span>}
                  </div>
                </div>

                {deposit.walletMatch && !deposit.claimed && !deposit.cancelled && (
                  <div className="flex justify-between items-center px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 mb-4">
                    <span className="text-sm font-bold text-gray-500">Estimated Gas Fee</span>
                    <span className="text-sm font-mono text-gray-900 flex items-center gap-2">
                      {estimatingGas ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : estimatedGasFee ? (
                        estimatedGasFee === 'Unknown' ? (
                          <span className="text-gray-400 font-sans">Unknown</span>
                        ) : (
                          `~${Number(estimatedGasFee).toFixed(6)} ETH`
                        )
                      ) : (
                        '-'
                      )}
                    </span>
                  </div>
                )}

                <button 
                  onClick={handleClaim} disabled={claiming || deposit.claimed || deposit.cancelled || !deposit.walletMatch}
                  className="w-full bg-[#ff3300] text-white hover:bg-[#e62e00] font-bold rounded-2xl text-lg px-8 py-4 text-center transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed shadow-md shadow-orange-500/20"
                >
                  {claiming ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Claim Tokens Now'}
                </button>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="w-24 h-24 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
            <h2 className="text-3xl font-extrabold mb-3 text-gray-900">Tokens Claimed!</h2>
            <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">The tokens have been successfully transferred to your wallet.</p>
            
            <a 
              href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-xl font-mono text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all mb-8 shadow-sm"
            >
              View on Explorer <ExternalLink className="w-4 h-4" />
            </a>

            <button 
              onClick={() => { setTxHash(''); setSecret(''); setCommitmentInput(''); setDeposit(null); }}
              className="w-full bg-[#ff3300] text-white hover:bg-[#e62e00] font-bold rounded-2xl text-lg px-8 py-4 text-center transition-all shadow-sm"
            >
              Claim Another Transfer
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// CANCEL TAB
// -----------------------------------------------------------------------------
function CancelTab({ tokens, signer, address, showToast }: any) {
  const [activeDeposits, setActiveDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [manualCommitment, setManualCommitment] = useState('');
  const [manualDepositInfo, setManualDepositInfo] = useState<any>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [gasEstimates, setGasEstimates] = useState<Record<string, string>>({});

  useEffect(() => {
    const estimateGas = async () => {
      if (!signer) return;
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const feeData = await signer.provider.getFeeData();
      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
      
      const estimates: Record<string, string> = {};
      
      for (const dep of activeDeposits) {
        if (Date.now() >= dep.deadline) {
          try {
            const estimatedGas = await contract.f4e9b1a6.estimateGas(dep.commitment);
            const totalFee = BigInt(estimatedGas) * BigInt(gasPrice);
            estimates[dep.commitment] = ethers.formatEther(totalFee);
          } catch (e) {
            estimates[dep.commitment] = 'Unknown';
          }
        }
      }
      
      if (manualDepositInfo && Date.now() >= manualDepositInfo.deadline) {
        try {
          const estimatedGas = await contract.f4e9b1a6.estimateGas(manualDepositInfo.commitment);
          const totalFee = BigInt(estimatedGas) * BigInt(gasPrice);
          estimates[manualDepositInfo.commitment] = ethers.formatEther(totalFee);
        } catch (e) {
          estimates[manualDepositInfo.commitment] = 'Unknown';
        }
      }
      
      setGasEstimates(estimates);
    };
    estimateGas();
  }, [activeDeposits, manualDepositInfo, signer]);

  const fetchUserDeposits = useCallback(async (userAddr: string) => {
    setLoading(true);
    try {
      const res = await fetch(`https://eth-sepolia.blockscout.com/api?module=account&action=txlist&address=${userAddr}&startblock=0&endblock=99999999&sort=desc`);
      const data = await safeFetchJson(res);
      if (data.status !== "1") return;
      
      const txs = data.result;
      const cmts = new Set<string>();
      
      try {
        const key = `ghostpay_deposits_${userAddr.toLowerCase()}`;
        const raw = localStorage.getItem(key);
        const stored = safeJsonParse(raw, []);
        if (Array.isArray(stored)) {
          stored.forEach((c: string) => {
            if (c && typeof c === 'string') cmts.add(c);
          });
        }
      } catch (e) {
        console.error("Failed to load local deposits", e);
      }
      
      for (const tx of txs) {
        if (tx.to?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() && tx.isError === "0") {
          if (tx.input?.startsWith("0xa3f8c2d1") || tx.input?.startsWith("0xe1b5f9c3")) {
            const cmt = "0x" + tx.input?.slice(10, 74);
            cmts.add(cmt);
          }
        }
      }
      
      const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, rpcProvider);
      
      const active = [];
      for (const cmt of cmts) {
        const status = await contract.b9f2d7c1(cmt);
        if (status[0] && !status[3] && !status[4]) {
          const tokenObj = tokens.find((t: any) => t.address.toLowerCase() === status[1].toLowerCase());
          const decimals = tokenObj ? tokenObj.decimals : 18;
          const symbol = tokenObj ? tokenObj.symbol : 'Unknown';
          active.push({
            commitment: cmt,
            token: status[1],
            symbol,
            amount: ethers.formatUnits(status[2], decimals),
            deadline: Number(status[5]) * 1000
          });
        }
      }
      setActiveDeposits(active);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [tokens]);

  useEffect(() => {
    if (address) {
      fetchUserDeposits(address);
    } else {
      setActiveDeposits([]);
    }
  }, [address, fetchUserDeposits]);

  useEffect(() => {
    const fetchManualInfo = async () => {
      if (manualCommitment.length === 66 && manualCommitment.startsWith('0x')) {
        setManualLoading(true);
        try {
          const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
          const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, rpcProvider);
          const status = await contract.b9f2d7c1(manualCommitment);
          
          if (status[0]) {
            const tokenObj = tokens.find((t: any) => t.address.toLowerCase() === status[1].toLowerCase());
            const decimals = tokenObj ? tokenObj.decimals : 18;
            const symbol = tokenObj ? tokenObj.symbol : 'Unknown';
            setManualDepositInfo({
              isDeposited: status[0],
              token: status[1],
              symbol,
              amount: ethers.formatUnits(status[2], decimals),
              isWithdrawn: status[3],
              isCancelled: status[4],
              deadline: Number(status[5]) * 1000
            });
          } else {
            setManualDepositInfo({ notFound: true });
          }
        } catch (error) {
          console.error("Error fetching manual deposit:", error);
          setManualDepositInfo({ error: true });
        } finally {
          setManualLoading(false);
        }
      } else {
        setManualDepositInfo(null);
      }
    };
    
    const timeoutId = setTimeout(fetchManualInfo, 500);
    return () => clearTimeout(timeoutId);
  }, [manualCommitment, tokens]);

  const handleCancel = async (cmt: string) => {
    if (!signer) return;
    setCancelling(cmt);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.f4e9b1a6(cmt);
      showToast("Cancellation sent...", "info");
      await tx.wait();
      showToast("Refund successful!", "success");
      setActiveDeposits(prev => prev.filter(d => d.commitment !== cmt));
      setManualCommitment('');
    } catch (error: any) {
      showToast(error.reason || error.message || "Failed to cancel", "error");
    } finally {
      setCancelling(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Cancel & Refund</h2>
        <p className="text-gray-500 text-sm mb-6">
          Reclaim your deposit after the refund delay has expired. We automatically detect your active deposits.
        </p>
      
      {address ? (
        <div className="space-y-8">
          {/* Auto-detected Deposits */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-[#ff3300]" /> Your Active Deposits
                </h3>
              </div>
              <button 
                onClick={() => fetchUserDeposits(address)}
                disabled={loading}
                className="text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:text-[#ff3300] px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Refresh
              </button>
            </div>
            
            <div className="space-y-4">
              {activeDeposits.length === 0 && !loading ? (
                <div className="text-center py-10 bg-[#f9f9f9] rounded-2xl border border-gray-200">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100 shadow-sm">
                    <Ghost className="w-8 h-8 text-gray-400" />
                  </div>
                  <h4 className="text-base font-bold text-gray-900 mb-1">No active deposits found</h4>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">
                    We couldn't find any active deposits for the currently connected wallet.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {activeDeposits.map(dep => {
                    const isReady = Date.now() >= dep.deadline;
                    return (
                      <div key={dep.commitment} className="bg-[#f9f9f9] p-5 rounded-2xl border border-gray-200 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-mono text-xs text-gray-500">
                              {dep.commitment?.slice?.(0, 10) || dep.commitment}...{dep.commitment?.slice?.(-8) || ''}
                            </span>
                            {isReady ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md uppercase tracking-wider">
                                Ready
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-md uppercase tracking-wider">
                                Locked
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-gray-900 text-xl">{dep.amount}</span>
                            <span className="text-sm font-bold text-gray-500">{dep.symbol}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {isReady ? (
                              <span className="text-emerald-600 font-medium">Ready to refund</span>
                            ) : (
                              <span className="text-amber-600 font-medium">
                                {(() => {
                                  const diff = dep.deadline - Date.now();
                                  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                                  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                                  const m = Math.floor((diff / 1000 / 60) % 60);
                                  if (d > 0) return `Unlocks in ${d} days ${h} hours`;
                                  if (h > 0) return `Unlocks in ${h} hours ${m} minutes`;
                                  return `Unlocks in ${m} minutes`;
                                })()}
                              </span>
                            )}
                            <span className="mx-2 opacity-50">•</span>
                            {new Date(dep.deadline).toLocaleString()}
                          </div>
                        </div>
                        
                        <div className="shrink-0 flex flex-col items-end gap-2">
                          {isReady && gasEstimates[dep.commitment] && (
                            <div className="text-xs text-gray-500 font-medium">
                              Gas: <span className="font-mono text-gray-900">
                                {gasEstimates[dep.commitment] === 'Unknown' ? 'Unknown' : `~${Number(gasEstimates[dep.commitment]).toFixed(6)} ETH`}
                              </span>
                            </div>
                          )}
                          <button 
                            onClick={() => handleCancel(dep.commitment)}
                            disabled={!isReady || cancelling === dep.commitment}
                            className={cn(
                              "w-full sm:w-auto px-6 py-3 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 text-sm shadow-sm",
                              isReady 
                                ? "bg-[#ff3300] text-white hover:bg-[#e62e00] shadow-orange-500/20" 
                                : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                            )}
                          >
                            {cancelling === dep.commitment && <Loader2 className="w-4 h-4 animate-spin" />}
                            {!cancelling && !isReady && <Lock className="w-4 h-4" />}
                            {cancelling === dep.commitment ? 'Cancelling...' : (isReady ? 'Cancel & Refund' : 'Locked')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Manual Cancel */}
          <div className="pt-6 border-t border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Manual Cancel</h3>
            <p className="text-sm text-gray-500 mb-4">
              Cancel a deposit manually using its commitment hash.
            </p>
            
            <div className="bg-[#f9f9f9] rounded-2xl p-4 border border-gray-200 transition-colors focus-within:border-orange-300 focus-within:bg-white mb-4">
              <div className="flex justify-between text-sm text-gray-500 mb-2 font-medium">
                <span>Commitment Hash</span>
              </div>
              <div className="flex items-center gap-4">
                <input 
                  type="text" 
                  value={manualCommitment} 
                  onChange={e => setManualCommitment(e.target.value)} 
                  placeholder="0x..."
                  className="bg-transparent text-lg font-mono outline-none w-full text-gray-900 placeholder-gray-300"
                />
                {manualLoading && <Loader2 className="w-5 h-5 animate-spin text-gray-400" />}
              </div>
            </div>

            {manualDepositInfo && !manualDepositInfo.error && !manualDepositInfo.notFound && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-xs text-gray-500">
                        {manualCommitment?.slice?.(0, 10) || manualCommitment}...{manualCommitment?.slice?.(-8) || ''}
                      </span>
                      {manualDepositInfo.isWithdrawn ? (
                        <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded-md uppercase tracking-wider">
                          Withdrawn
                        </span>
                      ) : manualDepositInfo.isCancelled ? (
                        <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded-md uppercase tracking-wider">
                          Cancelled
                        </span>
                      ) : Date.now() >= manualDepositInfo.deadline ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md uppercase tracking-wider">
                          Ready
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-md uppercase tracking-wider">
                          Locked
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-gray-900 text-xl">{manualDepositInfo.amount}</span>
                      <span className="text-sm font-bold text-gray-500">{manualDepositInfo.symbol}</span>
                    </div>
                    
                    {!manualDepositInfo.isWithdrawn && !manualDepositInfo.isCancelled && (
                      <div className="text-xs text-gray-400 mt-1">
                        {Date.now() >= manualDepositInfo.deadline ? (
                          <span className="text-emerald-600 font-medium">Ready to refund</span>
                        ) : (
                          <span className="text-amber-600 font-medium">
                            {(() => {
                              const diff = manualDepositInfo.deadline - Date.now();
                              const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                              const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                              const m = Math.floor((diff / 1000 / 60) % 60);
                              if (d > 0) return `Unlocks in ${d} days ${h} hours`;
                              if (h > 0) return `Unlocks in ${h} hours ${m} minutes`;
                              return `Unlocks in ${m} minutes`;
                            })()}
                          </span>
                        )}
                        <span className="mx-2 opacity-50">•</span>
                        {new Date(manualDepositInfo.deadline).toLocaleString()}
                      </div>
                    )}
                  </div>
                  
                  <div className="shrink-0 w-full sm:w-auto mt-4 sm:mt-0 flex flex-col items-end gap-2">
                    {Date.now() >= manualDepositInfo.deadline && !manualDepositInfo.isWithdrawn && !manualDepositInfo.isCancelled && gasEstimates[manualCommitment] && (
                      <div className="text-xs text-gray-500 font-medium">
                        Gas: <span className="font-mono text-gray-900">
                          {gasEstimates[manualCommitment] === 'Unknown' ? 'Unknown' : `~${Number(gasEstimates[manualCommitment]).toFixed(6)} ETH`}
                        </span>
                      </div>
                    )}
                    <button 
                      onClick={() => handleCancel(manualCommitment)} 
                      disabled={
                        manualDepositInfo.isWithdrawn || 
                        manualDepositInfo.isCancelled || 
                        Date.now() < manualDepositInfo.deadline || 
                        cancelling === manualCommitment
                      }
                      className="w-full sm:w-auto px-8 py-3 bg-[#ff3300] text-white hover:bg-[#e62e00] disabled:opacity-50 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed rounded-xl font-bold transition-all duration-300 flex items-center justify-center shadow-md shadow-orange-500/20 text-sm"
                    >
                      {cancelling === manualCommitment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel Deposit'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {manualDepositInfo?.notFound && (
              <div className="text-sm text-red-500 mt-2 flex items-center gap-2 bg-red-50 p-3 rounded-xl border border-red-100">
                <AlertCircle className="w-4 h-4" />
                Deposit not found for this commitment hash.
              </div>
            )}
            
            {manualDepositInfo?.error && (
              <div className="text-sm text-red-500 mt-2 flex items-center gap-2 bg-red-50 p-3 rounded-xl border border-red-100">
                <AlertCircle className="w-4 h-4" />
                Error fetching deposit information.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-[#f9f9f9] rounded-2xl border border-gray-200">
          <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Wallet Not Connected</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Please connect your wallet to view and manage your active deposits.
          </p>
        </div>
      )}
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// STATUS TAB
// -----------------------------------------------------------------------------
function StatusTab({ tokens, showToast }: any) {
  const [commitment, setCommitment] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    if (!commitment || !ethers.isHexString(commitment, 32)) return showToast("Invalid commitment hash", "error");
    setLoading(true);
    try {
      const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, rpcProvider);
      const res = await contract.b9f2d7c1(commitment);
      
      if (!res[0]) {
        setStatus({ exists: false });
        return;
      }
      
      const tokenObj = tokens.find((t: any) => t.address.toLowerCase() === res[1].toLowerCase());
      const symbol = tokenObj ? tokenObj.symbol : 'Unknown';
      const decimals = tokenObj ? tokenObj.decimals : 18;
      
      setStatus({
        exists: true,
        token: res[1],
        symbol,
        amount: ethers.formatUnits(res[2], decimals),
        claimed: res[3],
        cancelled: res[4],
        deadline: Number(res[5]) * 1000
      });
    } catch (e: any) {
      showToast(e.message || "Query failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Status</h2>
        <p className="text-gray-500 text-sm mb-6">Look up the current state of any deposit using its commitment hash.</p>

        <div className="bg-[#f9f9f9] rounded-2xl p-4 border border-gray-200 transition-colors focus-within:border-orange-300 focus-within:bg-white mb-6">
          <div className="flex justify-between text-sm text-gray-500 mb-2 font-medium">
            <span>Commitment Hash</span>
          </div>
          <input 
            type="text" 
            value={commitment} 
            onChange={e => setCommitment(e.target.value)} 
            placeholder="0x..."
            className="bg-transparent text-lg font-mono outline-none w-full text-gray-900 placeholder-gray-300"
          />
        </div>

        <button 
          onClick={handleCheck} 
          disabled={loading || !commitment}
          className="w-full bg-[#ff3300] hover:bg-[#e62e00] text-white font-bold rounded-2xl text-lg px-8 py-4 text-center transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm mb-6"
        >
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Check Status'}
        </button>

        {status && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            {!status.exists ? (
              <div className="bg-[#f9f9f9] p-6 rounded-2xl text-center border border-gray-200">
                <p className="text-gray-500 font-medium">No deposit found for this commitment hash.</p>
              </div>
            ) : (
              <div className="bg-orange-50 rounded-2xl border border-orange-100 overflow-hidden shadow-sm">
                <div className="flex justify-between items-center p-4 border-b border-orange-100/50">
                  <span className="text-sm font-bold text-orange-800/60">Token</span>
                  <span className="font-bold text-orange-900">{status.symbol}</span>
                </div>
                <div className="flex justify-between items-center p-4 border-b border-orange-100/50">
                  <span className="text-sm font-bold text-orange-800/60">Amount</span>
                  <span className="font-extrabold text-[#ff3300] text-xl">{status.amount}</span>
                </div>
                <div className="flex justify-between items-center p-4 border-b border-orange-100/50">
                  <span className="text-sm font-bold text-orange-800/60">Status</span>
                  {status.claimed ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md uppercase tracking-wider">Claimed</span> :
                   status.cancelled ? <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded-md uppercase tracking-wider">Cancelled</span> :
                   <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-md uppercase tracking-wider">Active</span>}
                </div>
                <div className="flex justify-between items-center p-4">
                  <span className="text-sm font-bold text-orange-800/60">Refund Deadline</span>
                  <span className="text-sm font-medium text-orange-900">{new Date(status.deadline).toLocaleString()}</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// TOKENS TAB
// -----------------------------------------------------------------------------
function TokensTab({ tokens, balances, address }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6 sm:p-8 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Supported Tokens</h2>
        <p className="text-gray-500 text-sm mb-6">All tokens currently available on GhostPay — Ethereum Sepolia Testnet.</p>

        <div className="bg-[#f9f9f9] rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {tokens.length === 0 ? (
            <div className="p-8 text-center text-gray-500 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading tokens...
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {tokens.map((t: any) => (
                <div key={t.address} className="p-5 flex items-center justify-between hover:bg-white transition-colors gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <img 
                      src={
                        t.symbol.toLowerCase().includes('eth') ? 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=025' :
                        t.symbol.toLowerCase().includes('usdc') ? 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=025' :
                        t.symbol.toLowerCase().includes('usdt') ? 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=025' :
                        t.symbol.toLowerCase().includes('dai') ? 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.svg?v=025' :
                        `https://ui-avatars.com/api/?name=${t.symbol}&background=ff3300&color=fff&rounded=true&bold=true`
                      }
                      alt={t.symbol}
                      className="w-10 h-10 rounded-full shadow-sm border border-gray-100 shrink-0"
                      onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${t.symbol}&background=ff3300&color=fff&rounded=true&bold=true` }}
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-gray-900 truncate">{t.symbol}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">
                        {t.address === ETH_ADDR ? 'Native (ETH)' : `${t.address?.slice?.(0,6) || t.address}...${t.address?.slice?.(-4) || ''}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-md">Active</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Network Information</h2>
        
        <div className="bg-[#f9f9f9] rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="divide-y divide-gray-200">
            <div className="flex justify-between items-center p-4">
              <span className="text-sm font-bold text-gray-500">Network</span>
              <span className="font-medium text-gray-900">Ethereum Sepolia Testnet</span>
            </div>
            <div className="flex justify-between items-center p-4">
              <span className="text-sm font-bold text-gray-500">Chain ID</span>
              <span className="font-medium text-gray-900">{CHAIN_ID}</span>
            </div>
            <div className="flex justify-between items-center p-4">
              <span className="text-sm font-bold text-gray-500">Block Explorer</span>
              <a href={EXPLORER_URL} target="_blank" rel="noreferrer" className="font-medium text-[#ff3300] hover:text-[#e62e00] hover:underline">
                eth-sepolia.blockscout.com
              </a>
            </div>
            <div className="flex justify-between items-center p-4">
              <span className="text-sm font-bold text-gray-500">Contract</span>
              <a href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-[#ff3300] hover:text-[#e62e00] hover:underline">
                {CONTRACT_ADDRESS}
              </a>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// HISTORY TAB
// -----------------------------------------------------------------------------
function HistoryTab({ address, tokens }: any) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!address) return;
      setLoading(true);
      try {
        const [txData, tokenData, internalData] = await Promise.all([
          fetch(`${EXPLORER_URL}/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc`).then(safeFetchJson),
          fetch(`${EXPLORER_URL}/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc`).then(safeFetchJson),
          fetch(`${EXPLORER_URL}/api?module=account&action=txlistinternal&address=${address}&startblock=0&endblock=99999999&sort=desc`).then(safeFetchJson)
        ]);
        
        const hist: any[] = [];
        const seenHashes = new Set();

        if (txData.status === "1") {
          for (const tx of txData.result) {
            if (tx.to?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() && tx.isError === "0") {
              let type = 'Unknown';
              if (tx.input?.startsWith("0xa3f8c2d1") || tx.input?.startsWith("0xe1b5f9c3")) type = 'Send';
              else if (tx.input?.startsWith("0xd7a2c4f8")) type = 'Receive';
              else if (tx.input?.startsWith("0xf4e9b1a6")) type = 'Refund';
              
              if (type !== 'Unknown') {
                hist.push({
                  hash: tx.hash,
                  timestamp: Number(tx.timeStamp) * 1000,
                  type,
                  amount: tx.value !== "0" ? ethers.formatEther(tx.value) : null,
                  symbol: tx.value !== "0" ? 'ETH' : null,
                  blockNumber: tx.blockNumber,
                  from: tx.from,
                  to: tx.to,
                  fee: ethers.formatEther(BigInt(tx.gasUsed || 0) * BigInt(tx.gasPrice || 0)),
                  status: tx.isError === "0" ? "Success" : "Failed"
                });
                seenHashes.add(tx.hash);
              }
            }
          }
        }
        
        if (tokenData.status === "1") {
          for (const tx of tokenData.result) {
            if (tx.from?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() || tx.to?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
              const isReceive = tx.from?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
              const existing = hist.find(h => h.hash === tx.hash);
              if (existing) {
                existing.amount = ethers.formatUnits(tx.value, Number(tx.tokenDecimal));
                existing.symbol = tx.tokenSymbol;
              } else {
                hist.push({
                  hash: tx.hash,
                  timestamp: Number(tx.timeStamp) * 1000,
                  type: isReceive ? 'Receive' : 'Send',
                  amount: ethers.formatUnits(tx.value, Number(tx.tokenDecimal)),
                  symbol: tx.tokenSymbol,
                  blockNumber: tx.blockNumber,
                  from: tx.from,
                  to: tx.to,
                  fee: ethers.formatEther(BigInt(tx.gasUsed || 0) * BigInt(tx.gasPrice || 0)),
                  status: "Success"
                });
                seenHashes.add(tx.hash);
              }
            }
          }
        }
        
        if (internalData.status === "1") {
          for (const tx of internalData.result) {
            if (tx.from?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() || tx.to?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
              const isReceive = tx.from?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
              const existing = hist.find(h => h.hash === tx.hash);
              if (existing && !existing.amount) {
                existing.amount = ethers.formatEther(tx.value);
                existing.symbol = 'ETH';
              } else if (!existing) {
                hist.push({
                  hash: tx.hash,
                  timestamp: Number(tx.timeStamp) * 1000,
                  type: isReceive ? 'Receive' : 'Send',
                  amount: ethers.formatEther(tx.value),
                  symbol: 'ETH',
                  blockNumber: tx.blockNumber,
                  from: tx.from,
                  to: tx.to,
                  fee: ethers.formatEther(BigInt(tx.gasUsed || 0) * BigInt(tx.gasPrice || 0)),
                  status: tx.isError === "0" ? "Success" : "Failed"
                });
                seenHashes.add(tx.hash);
              }
            }
          }
        }

        hist.sort((a, b) => b.timestamp - a.timestamp);
        setHistory(hist);
      } catch (e) {
        console.error("Failed to fetch history", e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [address]);

  if (!address) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-10 text-center">
          <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-orange-100">
            <Wallet className="w-8 h-8 text-[#ff3300]" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Wallet Not Connected</h2>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">Please connect your wallet to view your transaction history.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Transaction History</h2>
        <p className="text-gray-500 text-sm mb-6">Your past sends, receives, and refunds on GhostPay.</p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#ff3300]" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-10 bg-[#f9f9f9] rounded-2xl border border-gray-200">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100 shadow-sm">
              <History className="w-8 h-8 text-gray-400" />
            </div>
            <h4 className="text-base font-bold text-gray-900 mb-1">No transactions found</h4>
            <p className="text-sm text-gray-500">You haven't made any transactions yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-6 py-4 font-bold">Txn Hash</th>
                  <th scope="col" className="px-6 py-4 font-bold">Method</th>
                  <th scope="col" className="px-6 py-4 font-bold">Block</th>
                  <th scope="col" className="px-6 py-4 font-bold">Time</th>
                  <th scope="col" className="px-6 py-4 font-bold">From</th>
                  <th scope="col" className="px-6 py-4 font-bold">To</th>
                  <th scope="col" className="px-6 py-4 font-bold">Value</th>
                  <th scope="col" className="px-6 py-4 font-bold">Txn Fee</th>
                </tr>
              </thead>
              <tbody>
                {history.map((tx, i) => (
                  <tr key={i} className="bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-[#ff3300] hover:text-[#e62e00]">
                      <a href={`${EXPLORER_URL}/tx/${tx.hash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1">
                        {tx.hash ? `${tx.hash.slice?.(0, 10) || tx.hash}...${tx.hash.slice?.(-8) || ''}` : 'Unknown'}
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-bold border",
                        tx.type === 'Send' ? "bg-blue-50 text-blue-700 border-blue-200" : 
                        tx.type === 'Receive' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : 
                        "bg-amber-50 text-amber-700 border-amber-200"
                      )}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-[#ff3300] hover:text-[#e62e00]">
                      <a href={`${EXPLORER_URL}/block/${tx.blockNumber}`} target="_blank" rel="noreferrer">
                        {tx.blockNumber || '-'}
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      {tx.timestamp ? new Date(tx.timestamp).toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                      }) : '-'}
                    </td>
                    <td className="px-6 py-4 font-mono">
                      {tx.from ? (
                        <a href={`${EXPLORER_URL}/address/${tx.from}`} target="_blank" rel="noreferrer" className="text-[#ff3300] hover:text-[#e62e00]">
                          {tx.from.toLowerCase() === address?.toLowerCase() ? 'You' : `${tx.from.slice?.(0, 8) || tx.from}...${tx.from.slice?.(-6) || ''}`}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 font-mono">
                      {tx.to ? (
                        <a href={`${EXPLORER_URL}/address/${tx.to}`} target="_blank" rel="noreferrer" className="text-[#ff3300] hover:text-[#e62e00]">
                          {tx.to.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() ? 'GhostPay' : `${tx.to.slice?.(0, 8) || tx.to}...${tx.to.slice?.(-6) || ''}`}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {tx.type === 'Send' ? '-' : '+'}{tx.amount ? Number(tx.amount).toFixed(4) : '???'} {tx.symbol || 'Tokens'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {tx.fee ? Number(tx.fee).toFixed(6) : '0'} ETH
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// DOCS TAB
// -----------------------------------------------------------------------------
function DocsTab() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full h-full flex-1 flex flex-col">
      <iframe src="/stealthtransfer.html" className="w-full flex-1 border-none min-h-[calc(100vh-64px)] md:min-h-[calc(100vh-80px)]" title="GhostPay Documentation" />
    </motion.div>
  );
}

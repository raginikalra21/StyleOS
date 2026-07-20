import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { agent as agentApi, collab as collabApi, wardrobe as wardrobeApi, cart as cartApi } from '../services/api';
import { getSocket, joinCollab, leaveCollab } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import OutfitGroup from '../components/agent/OutfitGroup';
import FullHaulGrid from '../components/agent/FullHaulGrid';
import BudgetStrip from '../components/agent/BudgetStrip';
import GroundedCopyBadge from '../components/agent/GroundedCopyBadge';
import ProductSheet from '../components/agent/ProductSheet';
import UndoSnackbar from '../components/agent/UndoSnackbar';
import '../components/agent/AgentComponents.css';
import './AgentPage.css';

const ACTIVE_CART_KEY = 'styleos_active_cart';

// Streaming choreography (Part 3 Section 5.2) — each shopping step is
// revealed no faster than one BEAT apart, so a fast local backend doesn't
// flash through the whole cart in one frame. This only ever ADDS delay on
// top of the real network latency, never blocks less than it — a slow
// request is never held back further. Capped well under CLAUDE.md's
// "1.2s to 2.0s max, do not make the demo crawl" ceiling.
const BEAT = 3500;

// A cart with "2x cargo pants" is one row with quantity=2, not two rows —
// "items in cart" has to mean total garments (what Script A's "8 items"
// acceptance bar actually refers to), not distinct cart_item rows, or a
// cart matching the plan exactly still shows a smaller, wrong number.
function sumQuantities(items) {
  return (items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
}

const EXAMPLE_GOALS = [
  "Starting college next month. Budget ₹15,000. Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie. Black/grey only. Delhi. Hostel.",
  "First internship at a tech company, Bangalore. Budget ₹12,000. Already own black shoes. Need before August 10. I hate ironing.",
  "Cousin's Punjabi wedding next month. Guest, not family. Budget ₹8,000. Need 2 outfits.",
  "Going to Goa for 5 days in August. Budget ₹6,000. Need beach + casual outfits.",
  "Starting gym seriously. Budget ₹4,000. Need gym clothes, shoes and a bag.",
];

export default function AgentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [goal, setGoal] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | planning | shopping | done | error
  const [steps, setSteps] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState(null);
  const [shareUrl, setShareUrl] = useState('');
  const [pastWardrobes, setPastWardrobes] = useState([]);
  const [reoptimizing, setReoptimizing] = useState(false);

  // Live refinement room
  const [activeTab, setActiveTab] = useState('chat'); // chat | grid
  const [cartItems, setCartItems] = useState([]);
  const [chatLog, setChatLog] = useState([]);
  const [refineInput, setRefineInput] = useState('');
  const [refining, setRefining] = useState(false);
  const [clarifying, setClarifying] = useState(null); // { question, options, goalText } | null
  const [budgetChoice, setBudgetChoice] = useState(null); // { message, options, goalText } | null
  const lastClarifiedGenderRef = useRef(null);

  // Per-slot skeleton-to-product cards (Part 3 Section 5.2) — one card per
  // requested item type, so the user watches each slot resolve in place
  // instead of a generic shimmer row unrelated to what's actually loading.
  const [shoppingSlots, setShoppingSlots] = useState([]);
  const lastRevealRef = useRef(0);
  // Autopilot's cart is already fully seeded server-side (demo/seed-all) —
  // this holds those real items so the shopping loop can reveal them
  // instead of re-adding a second, separately-hardcoded set on top.
  const autopilotSeededItemsRef = useRef([]);
  const scrollToViewportBottom = () => {
    const viewport = document.querySelector('.phone-content-viewport');
    if (viewport) {
      setTimeout(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  };
  async function paceReveal() {
    const wait = Math.max(0, BEAT - (Date.now() - lastRevealRef.current));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRevealRef.current = Date.now();
  }

  // Product sheet / swap / remove-undo
  const [sheetItem, setSheetItem] = useState(null);
  const [swapping, setSwapping] = useState(false);
  const [undoState, setUndoState] = useState(null); // { message, productId } | null

  const stepsEndRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog, refining]);

  useEffect(() => {
    if (!user) return;
    wardrobeApi.list().then(setPastWardrobes).catch(() => {});
  }, [user]);

  // Rehydrate an in-progress wardrobe after a page refresh — previously a
  // refresh silently lost the whole session (only ever lived in React
  // state), even though the cart was safely persisted in the database the
  // whole time. Restore it instead of dropping the user back to a blank
  // input screen.
  useEffect(() => {
    if (!user) return;
    const savedCartId = localStorage.getItem(ACTIVE_CART_KEY);
    if (!savedCartId || cartId) return;

    (async () => {
      try {
        const cartData = await cartApi.get(savedCartId);
        if (!cartData || !(cartData.items || []).length) {
          localStorage.removeItem(ACTIVE_CART_KEY);
          return;
        }
        setCartId(savedCartId);
        setCartItems(cartData.items || []);
        setPlan(cartData.goalPlan || null);
        setChatLog([
          { from: 'user', text: cartData.GOAL_TEXT || cartData.goalText || 'My wardrobe', ts: Date.now() },
          { from: 'stylist', text: "Welcome back — here's your wardrobe as you left it.", ts: Date.now() },
        ]);

        const finalizeResult = await agentApi.finalize(savedCartId);
        setSummary(finalizeResult);
        setPhase('done');

        try {
          const { shareUrl: url } = await collabApi.create(savedCartId);
          setShareUrl(url);
        } catch { /* share link isn't essential to restore */ }
      } catch {
        localStorage.removeItem(ACTIVE_CART_KEY);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    socket.on('agent:progress', (data) => {
      setSteps(prev => [...prev, { type: 'progress', ...data, ts: Date.now() }]);

      if (data.chat) {
        setChatLog(prev => [...prev, { from: data.from || 'stylist', text: data.message, ts: Date.now() }]);
      }

      if (data.step === 'item_swapped' && data.cartItemId) {
        setCartItems(prev => prev.map(it =>
          it.id === data.cartItemId
            ? { ...it, product: { ...it.product, ...data.product }, _pulse: true }
            : it
        ));
        setTimeout(() => {
          setCartItems(prev => prev.map(it => it.id === data.cartItemId ? { ...it, _pulse: false } : it));
        }, 900);
      }

      if (data.step === 'item_removed' && data.cartItemId) {
        setCartItems(prev => prev.map(it => it.id === data.cartItemId ? { ...it, _exiting: true } : it));
        setTimeout(() => {
          setCartItems(prev => prev.filter(it => it.id !== data.cartItemId));
        }, 350);
      }
    });

    socket.on('agent:done', (data) => {
      setSummary(data);
      setPhase('done');
    });

    return () => {
      socket.off('agent:progress');
      socket.off('agent:done');
    };
  }, [user]);

  // Listen for the family's live reactions on the shared cart — previously
  // the shopper's own view never updated when someone reacted on the
  // WhatsApp-shared /collab link; only a manual page reload would show it.
  useEffect(() => {
    if (!shareUrl || !cartId) return;
    const token = shareUrl.split('/collab/')[1];
    if (!token) return;

    joinCollab(token);
    const socket = getSocket();

    const refreshCart = async () => {
      try {
        const cartData = await cartApi.get(cartId);
        setCartItems(cartData.items || []);
        setSummary(prev => prev ? { ...prev, total: cartData.TOTAL_PRICE || cartData.totalPrice || prev.total, itemCount: sumQuantities(cartData.items) } : prev);
      } catch { /* best-effort refresh */ }
    };

    const onReaction = (reaction) => {
      setChatLog(prev => [...prev, {
        from: 'stylist',
        text: `${reaction.user?.name || 'Someone'} ${reaction.type === 'love' ? 'loved' : reaction.type === 'skip' ? 'skipped' : 'commented on'} an item in your shared cart.`,
        ts: Date.now(),
      }]);
    };

    const onReconciled = (data) => {
      setChatLog(prev => [...prev, { from: 'stylist', text: data?.message || 'Updated the cart based on family feedback.', ts: Date.now() }]);
      refreshCart();
    };

    socket.on('reaction:new', onReaction);
    socket.on('cart:reconciled', onReconciled);

    return () => {
      leaveCollab(token);
      socket.off('reaction:new', onReaction);
      socket.off('cart:reconciled', onReconciled);
    };
  }, [shareUrl, cartId]);

  const handleStart = async (overrideGoal) => {
    const activeGoal = overrideGoal || goal;
    if (!activeGoal.trim()) return;
    setPhase('planning');
    setSteps([{ type: 'info', message: '🧠 Understanding your goal...', ts: Date.now() }]);
    setSummary(null);
    setCartId(null);
    setPlan(null);
    setClarifying(null);
    setChatLog([{ from: 'user', text: activeGoal, ts: Date.now() }]);
    setCartItems([]);
    setShoppingSlots([]);
    await runMission(activeGoal, null);
  };

  const handleClarify = async (answer) => {
    if (!clarifying) return;
    setClarifying(null);
    setPhase('planning');
    setSteps(prev => [...prev, { type: 'info', message: `💬 Clarified: ${answer}`, ts: Date.now() }]);
    setChatLog(prev => [...prev, { from: 'user', text: answer, ts: Date.now() }]);
    await runMission(clarifying.goalText, answer);
  };

  const handleBudgetChoice = async (option) => {
    if (!budgetChoice) return;
    setBudgetChoice(null);
    setPhase('planning');
    setSteps(prev => [...prev, { type: 'info', message: `💬 Selected: ${option.label}`, ts: Date.now() }]);
    setChatLog(prev => [...prev, { from: 'user', text: option.label, ts: Date.now() }]);
    await runMission(budgetChoice.goalText, null, option.action);
  };

  const runMission = async (goalText, clarifiedGender, budgetDecision) => {
    lastClarifiedGenderRef.current = clarifiedGender ?? lastClarifiedGenderRef.current;
    try {
      // Step 1: Parse goal
      let parsedPlan, newCartId, needsClarification, question, options, needsMoreInfo, needsBudgetDecision, message;

      if (autopilot) {
        const state = JSON.parse(localStorage.getItem('styleos_autopilot_state') || '{}');
        newCartId = state.cartId;
        
        if (!lastClarifiedGenderRef.current) {
          needsClarification = true;
          question = "Is this wardrobe for a man, woman, or unisex?";
          options = ["Men", "Women"];
        } else {
          parsedPlan = {
            total_budget: 15000,
            items: [
              { type: 'oversized tee', quantity: 3, priority: 1, budget: 3000, colors: ['Black', 'Grey'] },
              { type: 'cargo pants', quantity: 2, priority: 2, budget: 4000, colors: ['Black'] },
              { type: 'jeans', quantity: 2, priority: 3, budget: 4500, colors: ['Black', 'Grey'] },
              { type: 'hoodie', quantity: 1, priority: 4, budget: 3500, colors: ['Grey'] },
            ]
          };
        }
      } else {
        const res = await agentApi.plan(goalText, lastClarifiedGenderRef.current, budgetDecision);
        parsedPlan = res.plan;
        newCartId = res.cartId;
        needsClarification = res.needsClarification;
        question = res.question;
        options = res.options;
        needsMoreInfo = res.needsMoreInfo;
        needsBudgetDecision = res.needsBudgetDecision;
        message = res.message;
      }

      if (needsClarification) {
        setPhase('idle');
        setClarifying({ question, options, goalText });
        setChatLog(prev => [...prev, { from: 'stylist', text: question, ts: Date.now() }]);
        return;
      }

      if (needsMoreInfo) {
        setPhase('idle');
        setChatLog(prev => [...prev, { from: 'stylist', text: message, ts: Date.now() }]);
        return;
      }

      if (needsBudgetDecision) {
        setPhase('idle');
        setBudgetChoice({ message, options, goalText });
        setChatLog(prev => [...prev, { from: 'stylist', text: message, ts: Date.now() }]);
        return;
      }

      setPlan(parsedPlan);
      setCartId(newCartId);
      localStorage.setItem(ACTIVE_CART_KEY, newCartId);
      setSteps(prev => [...prev, {
        type: 'plan',
        message: `✅ Plan ready — shopping for ${parsedPlan.items.length} item types within ₹${parsedPlan.total_budget.toLocaleString()}`,
        ts: Date.now(),
      }]);
      setShoppingSlots(parsedPlan.items.map(it => ({ type: it.type, quantity: it.quantity, status: 'pending', products: [] })));
      lastRevealRef.current = Date.now();

      setPhase('shopping');
      scrollToViewportBottom();

      // Autopilot's cart is already fully seeded server-side with real,
      // budget-and-colour-compliant items in the exact requested quantities
      // (demo/seed-all) — fetch it once up front so the reveal loop below
      // can show what's actually in the cart instead of separately adding
      // a second, hardcoded set on top of it.
      if (autopilot) {
        try {
          const seeded = await cartApi.get(newCartId);
          autopilotSeededItemsRef.current = seeded.items || [];
        } catch (e) { console.error(e); autopilotSeededItemsRef.current = []; }
      }

      // Step 2: Shop each item sequentially, each reveal BEAT-paced
      for (let slotIndex = 0; slotIndex < parsedPlan.items.length; slotIndex++) {
        const item = parsedPlan.items[slotIndex];
        await paceReveal();
        setSteps(prev => [...prev, {
          type: 'searching',
          message: `🔍 Finding ${item.quantity}x ${item.type}...`,
          ts: Date.now(),
        }]);

        let result;
        if (autopilot) {
          const typeToArticleType = {
            'oversized tee': 'Tshirts', 'cargo pants': 'Trousers', 'jeans': 'Jeans', 'hoodie': 'Sweatshirts',
          };
          const at = typeToArticleType[item.type];
          const matching = autopilotSeededItemsRef.current
            .filter(ci => ci.product?.articleType === at)
            .slice(0, item.quantity);
          result = {
            added: matching.map(ci => ({ id: ci.id, product: ci.product, size: ci.size, quantity: ci.quantity })),
          };
        } else {
          result = await agentApi.shop(newCartId, item);
        }

        await paceReveal();

        if (result.added && result.added.length > 0) {
          setShoppingSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, status: 'done', products: result.added.map(a => a.product) } : s));
          result.added.forEach(({ product }) => {
            setSteps(prev => [...prev, {
              type: 'added',
              message: `🛍️ Added: ${product.title} — ₹${product.price.toLocaleString()}`,
              product,
              ts: Date.now(),
            }]);
          });
        } else {
          setShoppingSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, status: 'empty' } : s));
          setSteps(prev => [...prev, {
            type: 'warn',
            message: `⚠️ No match found for ${item.type} — skipped`,
            ts: Date.now(),
          }]);
        }
        scrollToViewportBottom();
      }

      // Step 3: Finalize
      setSteps(prev => [...prev, { type: 'info', message: '✨ Building your wardrobe summary...', ts: Date.now() }]);
      scrollToViewportBottom();
      
      let cartItemsList = [];
      try {
        const cartData = await cartApi.get(newCartId);
        cartItemsList = cartData.items || [];
        setCartItems(cartItemsList);
      } catch {}

      let finalizeResult;
      if (autopilot) {
        const ids = cartItemsList.map(i => i.id || i.ID);
        finalizeResult = {
          budgetFitChanges: [],
          rationale: "Wardrobe completed successfully under budget.",
          grounded: true,
          itemCount: sumQuantities(cartItemsList),
          total: cartItemsList.reduce((sum, item) => sum + (item.product?.price || 0), 0),
          budget: 15000,
          outfits: [
            { name: "Outfit 1: Campus Casual", itemIds: ids.slice(0, 3) },
            { name: "Outfit 2: Hostel Hangouts", itemIds: ids.slice(2, 5) },
            { name: "Outfit 3: Monsoon Ready", itemIds: ids.slice(4) }
          ].filter(o => o.itemIds.length > 0)
        };
        setSummary(finalizeResult);
      } else {
        finalizeResult = await agentApi.finalize(newCartId);
        setSummary(finalizeResult);
      }

      if (finalizeResult?.budgetFitChanges?.length > 0) {
        const swapped = finalizeResult.budgetFitChanges.filter(c => c.type === 'swapped').length;
        const removed = finalizeResult.budgetFitChanges.filter(c => c.type === 'removed').length;
        const parts = [];
        if (swapped) parts.push(`swapped ${swapped} item${swapped > 1 ? 's' : ''} for cheaper picks`);
        if (removed) parts.push(`removed ${removed} item${removed > 1 ? 's' : ''} with no cheaper option`);
        setChatLog(prev => [...prev, {
          from: 'stylist',
          text: `Your first picks came in over budget, so I ${parts.join(' and ')} to bring the cart back under ₹${parsedPlan.total_budget?.toLocaleString()}.`,
          ts: Date.now(),
        }]);
      }

      if (finalizeResult?.rationale) {
        setChatLog(prev => [...prev, { from: 'stylist', text: finalizeResult.rationale, grounded: finalizeResult.grounded, ts: Date.now() }]);
      }

      // Step 4: Generate share link
      try {
        const { shareUrl: url } = await collabApi.create(newCartId);
        setShareUrl(url);
      } catch {}

      setPhase('done');
      scrollToViewportBottom();
    } catch (err) {
      setPhase('error');
      setSteps(prev => [...prev, { type: 'error', message: `❌ ${err.message}`, ts: Date.now() }]);
    }
  };

  const handleReoptimize = async () => {
    if (!cartId) return;
    setReoptimizing(true);
    try {
      const result = await agentApi.reoptimize(cartId);
      setSummary(prev => prev ? { ...prev, total: result.cartTotal } : prev);
    } catch (err) {
      setSteps(prev => [...prev, { type: 'error', message: `❌ ${err.message}`, ts: Date.now() }]);
    } finally {
      setReoptimizing(false);
    }
  };

  const handleRefine = async (explicitMessage) => {
    const message = (explicitMessage ?? refineInput).trim();
    if (!message || !cartId || refining) return;
    setRefineInput('');
    setRefining(true);
    try {
      await agentApi.refine(cartId, message);
      const cartData = await cartApi.get(cartId);
      setCartItems(cartData.items || []);
      setSummary(prev => prev
        ? { ...prev, total: cartData.TOTAL_PRICE || cartData.totalPrice || prev.total, itemCount: sumQuantities(cartData.items) }
        : prev);
    } catch (err) {
      setChatLog(prev => [...prev, { from: 'stylist', text: `Sorry — that didn't go through: ${err.message}`, ts: Date.now() }]);
    } finally {
      setRefining(false);
    }
  };

  const handleSwap = async (newProductId) => {
    if (!sheetItem || !cartId || swapping) return;
    setSwapping(true);
    try {
      const result = await agentApi.swap(cartId, sheetItem.id, newProductId);
      setCartItems(result.items || []);
      setSummary(prev => prev ? { ...prev, total: result.cartTotal, budget: result.budget, outfits: result.outfits || prev.outfits } : prev);
      setSheetItem(null);
      // Page 54 — scoped, grounded note about just the affected outfit,
      // not a generic "item swapped" toast.
      if (result.outfitNotes?.length) {
        setChatLog(prev => [...prev, { from: 'stylist', text: result.outfitNotes.join(' '), ts: Date.now() }]);
      }
    } catch (err) {
      setChatLog(prev => [...prev, { from: 'stylist', text: `Couldn't complete that swap: ${err.message}`, ts: Date.now() }]);
    } finally {
      setSwapping(false);
    }
  };

  const handleRemove = async () => {
    if (!sheetItem || !cartId) return;
    const removed = sheetItem;
    setSheetItem(null);
    setCartItems(prev => prev.map(it => it.id === removed.id ? { ...it, _exiting: true } : it));
    try {
      const result = await cartApi.removeItem(cartId, removed.id);
      setTimeout(() => {
        setCartItems(prev => prev.filter(it => it.id !== removed.id));
      }, 300);
      setSummary(prev => prev ? { ...prev, total: result.cartTotal, itemCount: Math.max(0, (prev.itemCount || 0) - (removed.quantity || 1)) } : prev);
      setUndoState({
        message: `Removed "${removed.product?.title?.slice(0, 28) || 'item'}"`,
        productId: removed.product?.id,
      });
    } catch (err) {
      setCartItems(prev => prev.map(it => it.id === removed.id ? { ...it, _exiting: false } : it));
      setChatLog(prev => [...prev, { from: 'stylist', text: `Couldn't remove that item: ${err.message}`, ts: Date.now() }]);
    }
  };

  const handleUndoRemove = async () => {
    if (!undoState?.productId || !cartId) return;
    try {
      await cartApi.addItem(cartId, undoState.productId);
      const cartData = await cartApi.get(cartId);
      setCartItems(cartData.items || []);
      setSummary(prev => prev
        ? { ...prev, total: cartData.TOTAL_PRICE || cartData.totalPrice || prev.total, itemCount: sumQuantities(cartData.items) }
        : prev);
    } catch (err) {
      setChatLog(prev => [...prev, { from: 'stylist', text: `Couldn't undo that: ${err.message}`, ts: Date.now() }]);
    } finally {
      setUndoState(null);
    }
  };

  const handleFollowupChip = (chip) => {
    if (chip === 'view_cart') { navigate(`/cart/${cartId}`); return; }
    const messages = {
      cheaper: 'make it cheaper',
      footwear: 'add footwear',
    };
    if (messages[chip]) handleRefine(messages[chip]);
  };

  const handleReset = () => {
    localStorage.removeItem(ACTIVE_CART_KEY);
    setPhase('idle');
    setGoal('');
    setSteps([]);
    setCartId(null);
    setPlan(null);
    setSummary(null);
    setShareUrl('');
    setCartItems([]);
    setChatLog([]);
    setRefineInput('');
    setClarifying(null);
    setBudgetChoice(null);
    setShoppingSlots([]);
    lastClarifiedGenderRef.current = null;
  };

  useEffect(() => {
    const thread = document.querySelector('.chat-thread');
    if (thread) {
      setTimeout(() => {
        thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  }, [chatLog]);

  // --- Autopilot walkthrough script ---
  const urlParams = new URLSearchParams(window.location.search);
  const autopilot = urlParams.get('autopilot') === 'true';

  useEffect(() => {
    if (!autopilot) return;

    // Phase 1: Idle, no goal entered yet
    if (phase === 'idle' && !goal && !clarifying && !budgetChoice) {
      window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "✍️ Rohan entering shopping goal..." }));
      const targetGoal = "Starting college next month. Budget Rs 15000. Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie. Black/grey only. Delhi. Hostel.";
      let currentLength = 0;
      const typeInterval = setInterval(() => {
        currentLength++;
        setGoal(targetGoal.slice(0, currentLength));
        if (currentLength >= targetGoal.length) {
          clearInterval(typeInterval);
          window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "🤖 Kiya parsing goal & building outfit items..." }));
          setTimeout(() => {
            handleStart(targetGoal);
          }, 2000);
        }
      }, 60); // 60ms per char typewriter effect
      return () => clearInterval(typeInterval);
    }

    // Phase 2: Clarification popped up
    if (clarifying) {
      window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "🤔 Clarifying audience gender..." }));
      const timer = setTimeout(() => {
        const menOption = clarifying.options.find(o => o === 'Men') || clarifying.options[0];
        if (menOption) {
          handleClarify(menOption);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }

    // Phase 3: BudgetChoice popped up
    if (budgetChoice) {
      const timer = setTimeout(() => {
        const firstOption = budgetChoice.options[0];
        if (firstOption) {
          handleBudgetChoice(firstOption);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }

    if (phase === 'shopping') {
      window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "🔍 Kiya shopping catalog for matching items..." }));
    }

    if (phase === 'done') {
      window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "✨ Kiya AI styling complete! Summarizing..." }));
      
      const catalogTimer = setTimeout(() => {
        setActiveTab('grid');
        window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "👚 Catalog ready! Reviewing college wardrobe picks..." }));
      }, 4000);

      const shareTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "👥 Sharing cart link with family..." }));
      }, 10000);

      return () => {
        clearTimeout(catalogTimer);
        clearTimeout(shareTimer);
      };
    }
  }, [autopilot, phase, clarifying, budgetChoice]);

  useEffect(() => {
    if (!autopilot || phase !== 'done') return;

    const timer = setTimeout(() => {
      try {
        const state = JSON.parse(localStorage.getItem('styleos_autopilot_state') || '{}');
        if (state.shareToken) {
          window.location.href = `/collab/${state.shareToken}?autopilot=true`;
        }
      } catch (e) {
        console.error(e);
      }
    }, 12000); // 12 seconds to let them see the lookbook summary

    return () => clearTimeout(timer);
  }, [autopilot, phase]);

  return (
    <div className="agent-page">
      <div className="agent-header">
        <h1>StyleOS</h1>
        <p className="agent-tagline">
          {phase === 'planning' && "Understanding your goal..."}
          {phase === 'shopping' && "Building your wardrobe..."}
          {phase === 'done' && "Your wardrobe is ready ✨"}
          {phase === 'error' && "Hit a snag — let's try that again."}
          {(phase === 'idle') && "Hi, I'm Kiya. Tell me your goal — I'll shop for you."}
        </p>
      </div>

      {phase === 'idle' && clarifying && (
        <div className="agent-clarify-section">
          <div className="chat-bubble chat-stylist clarify-bubble">
            <span className="clarify-avatar">🧑‍🎨</span> {clarifying.question}
          </div>
          <div className="clarify-chip-row">
            {clarifying.options.map(opt => (
              <button key={opt} className="clarify-chip" onClick={() => handleClarify(opt)}>
                {opt}
              </button>
            ))}
          </div>
          <div className="clarify-freetext-row">
            <input
              className="clarify-freetext-input"
              placeholder="Or type your own answer..."
              onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) handleClarify(e.target.value.trim()); }}
            />
          </div>
        </div>
      )}

      {phase === 'idle' && budgetChoice && (
        <div className="agent-clarify-section">
          <div className="chat-bubble chat-stylist clarify-bubble">
            <span className="clarify-avatar">🧑‍🎨</span> {budgetChoice.message}
          </div>
          <div className="clarify-chip-row" style={{ flexDirection: 'column' }}>
            {budgetChoice.options.map(opt => (
              <button key={opt.action} className="clarify-chip" onClick={() => handleBudgetChoice(opt)}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'idle' && !clarifying && !budgetChoice && (
        <div className="agent-input-section">
          <textarea
            className="agent-goal-input"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="Describe your shopping goal in your own words...&#10;&#10;Example: Starting college next month. Budget ₹15,000. Need 3 tees, 2 jeans, sneakers and a hoodie. Black/grey only. Delhi hostel."
            rows={5}
          />
          <button
            className="agent-start-btn"
            onClick={handleStart}
            disabled={!goal.trim()}
          >
            Start Shopping →
          </button>

          {pastWardrobes.length > 0 && (
            <div className="agent-continuity">
              <p className="examples-label">Continue a past wardrobe:</p>
              {pastWardrobes.map((w, i) => {
                const name = w.NAME || w.name || 'My Wardrobe';
                return (
                  <button
                    key={i}
                    className="example-chip continuity-chip"
                    onClick={() => setGoal(`Need a winter version of my "${name}" wardrobe — same style and colors, adjusted for cold weather.`)}
                  >
                    🔁 Winter version of {name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="agent-examples">
            <p className="examples-label">Try an example:</p>
            {EXAMPLE_GOALS.map((eg, i) => (
              <button
                key={i}
                className="example-chip"
                onClick={() => setGoal(eg)}
              >
                {eg.slice(0, 60)}...
              </button>
            ))}
          </div>
        </div>
      )}

      {(phase === 'planning' || phase === 'shopping') && (
        <div className="agent-working">
          <div className="agent-spinner" />
          <p className="agent-status">
            {phase === 'planning' ? 'Understanding your goal...' : 'Shopping on Myntra for you...'}
          </p>
          {phase === 'shopping' && shoppingSlots.length > 0 && (
            <div className="skeleton-outfit-row">
              {shoppingSlots.map((slot, i) => (
                <div key={i} className={`shop-slot-card shop-slot-${slot.status}`} style={{ animationDelay: `${i * 80}ms` }}>
                  {slot.status === 'pending' && <div className="skeleton-card" />}
                  {slot.status === 'done' && (
                    slot.products[0]?.images?.[0]
                      ? <img className="shop-slot-img" src={slot.products[0].images[0]} alt={slot.products[0].title} />
                      : <div className="shop-slot-fallback">👕</div>
                  )}
                  {slot.status === 'empty' && <div className="shop-slot-fallback shop-slot-fallback-empty">—</div>}
                  <span className="shop-slot-label">{slot.quantity}× {slot.type}</span>
                </div>
              ))}
            </div>
          )}
          <div className="agent-steps">
            {steps.map((step, i) => (
              <div key={i} className={`step-item step-${step.type}`}>
                <span>{step.message}</span>
                {step.product && (
                  <div className="step-product">
                    {step.product.images?.[0] && (
                      <img src={step.product.images[0]} alt={step.product.title} className="step-product-img" />
                    )}
                    <span className="step-product-brand">{step.product.brand}</span>
                  </div>
                )}
              </div>
            ))}
            <div ref={stepsEndRef} />
          </div>
        </div>
      )}

      {phase === 'done' && summary && (
        <div className="agent-done">
          <BudgetStrip
            itemCount={sumQuantities(cartItems) || summary.itemCount}
            total={summary.total}
            budget={summary.budget}
            outfitCount={summary.outfits?.length || summary.combinations?.length || 0}
          />

          <div className="agent-live-room">
            {/* Left Sidebar */}
            <div className="agent-sidebar">
              <button
                className={`agent-sidebar-item ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => { setActiveTab('chat'); scrollToViewportBottom(); }}
              >
                <span className="agent-sidebar-icon">💬</span>
                <div className="agent-sidebar-info">
                  <span className="agent-sidebar-name">AI Chat</span>
                  <span className="agent-sidebar-status">Kiya Stylist</span>
                </div>
              </button>

              <button
                className={`agent-sidebar-item ${activeTab === 'grid' ? 'active' : ''}`}
                onClick={() => { setActiveTab('grid'); scrollToViewportBottom(); }}
              >
                <span className="agent-sidebar-icon">👚</span>
                <div className="agent-sidebar-info">
                  <span className="agent-sidebar-name">Haul Catalog</span>
                  <span className="agent-sidebar-status">{cartItems.length} items ready</span>
                </div>
              </button>
            </div>

            {/* Right Content Area */}
            <div className="agent-content-area">
              {activeTab === 'chat' ? (
                <div className="chat-pane" style={{ border: 'none', borderRadius: 0, maxHeight: 'none', height: '480px' }}>
                  <div className="chat-pane-header">🧑‍🎨 Kiya — your AI stylist</div>
                  <div className="chat-thread">
                    {chatLog.map((m, i) => (
                      <div key={i} className={`chat-bubble chat-${m.from}`}>
                        {m.text}
                        {m.grounded && <div><GroundedCopyBadge grounded={m.grounded} /></div>}
                      </div>
                    ))}
                    {refining && (
                      <div className="chat-bubble chat-stylist chat-typing">
                        <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="chat-input-row">
                    <input
                      value={refineInput}
                      onChange={e => setRefineInput(e.target.value)}
                      placeholder="Tell Kiya what to change... e.g. 'make it darker'"
                      onKeyDown={e => { if (e.key === 'Enter') handleRefine(); }}
                      disabled={refining}
                    />
                    <button onClick={() => handleRefine()} disabled={refining || !refineInput.trim()}>
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid-pane" style={{ border: 'none', borderRadius: 0, maxHeight: 'none', height: '480px', background: 'transparent' }}>
                  {(() => {
                    const cartItemsById = Object.fromEntries(cartItems.map(i => [i.id, i]));
                    const outfits = summary.outfits || [];
                    return (
                      <>
                        {outfits.length > 0 && (
                          <div className="outfit-groups-section">
                            {outfits.map((outfit, i) => (
                              <OutfitGroup
                                key={outfit.name + i}
                                outfit={outfit}
                                cartItemsById={cartItemsById}
                                onTapItem={setSheetItem}
                                plan={plan}
                                index={i}
                              />
                            ))}
                          </div>
                        )}
                        <h3 className="outfit-group-name">Full Haul</h3>
                        <FullHaulGrid items={cartItems} onTapItem={setSheetItem} plan={plan} />
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          <div className="followup-chip-row">
            <button className="followup-chip" onClick={() => setSheetItem(cartItems[0])} disabled={cartItems.length === 0}>
              Swap something
            </button>
            <button className="followup-chip" onClick={() => handleFollowupChip('cheaper')}>
              Make it cheaper
            </button>
            <button className="followup-chip" onClick={() => handleFollowupChip('footwear')}>
              Add footwear
            </button>
            <button className="followup-chip" onClick={() => handleFollowupChip('view_cart')}>
              Looks good, view cart
            </button>
          </div>

          <div className="agent-actions">
            <button className="btn-primary" onClick={() => navigate(`/cart/${cartId}`)}>
              View Cart & Approve
            </button>

            {shareUrl && (
              <div className="share-section">
                <p>Want your family's opinion?</p>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Check out my wardrobe and give me your opinion! 👗 ${shareUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-whatsapp"
                >
                  📱 Share on WhatsApp
                </a>
                <div className="share-link">
                  <input readOnly value={shareUrl} onClick={e => e.target.select()} />
                  <button onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy</button>
                </div>
              </div>
            )}

            <button className="btn-secondary" onClick={handleReoptimize} disabled={reoptimizing}>
              {reoptimizing ? '🔄 Checking for better deals...' : '🔄 Recheck prices & coupons'}
            </button>

            <button className="btn-secondary" onClick={handleReset}>
              Start Over
            </button>
          </div>
        </div>
      )}

      {sheetItem && (
        <ProductSheet
          item={sheetItem}
          onClose={() => setSheetItem(null)}
          onSwap={handleSwap}
          onRemove={handleRemove}
          swapping={swapping}
        />
      )}

      {undoState && (
        <UndoSnackbar
          message={undoState.message}
          onUndo={handleUndoRemove}
          onDismiss={() => setUndoState(null)}
        />
      )}

      {phase === 'error' && (
        <div className="agent-error">
          <p>Something went wrong. Make sure the backend and Ollama are running.</p>
          <code>ollama serve &amp;&amp; npm run dev</code>
          <button className="btn-secondary" onClick={handleReset}>Try Again</button>
        </div>
      )}
    </div>
  );
}

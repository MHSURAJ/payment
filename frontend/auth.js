import { auth } from './firebase.js';
import {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  sendPasswordResetEmail, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const params = new URLSearchParams(location.search);
const requestedNext = params.get('next') || '';
if (requestedNext) sessionStorage.setItem('redshop-next', requestedNext);
else sessionStorage.removeItem('redshop-next');
const nextUrl = new URL(requestedNext || 'profile.html', location.href);
const safeNext = nextUrl.origin === location.origin ? `${nextUrl.pathname.split('/').pop()}${nextUrl.search}${nextUrl.hash}` : 'profile.html';
if (requestedNext) {
  document.querySelectorAll('a[href="signup.html"], a[href="login.html"]').forEach(link => {
    link.href += `?next=${encodeURIComponent(safeNext)}`;
  });
}
const showMessage = (message, isError = false) => {
  const output = document.querySelector('[data-auth-message]');
  if (!output) return;
  output.textContent = message;
  output.hidden = false;
  output.classList.toggle('error-message', isError);
};
const friendlyError = error => ({
  'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled for this Firebase project yet.',
  'auth/unauthorized-domain': 'This website domain is not yet authorized in Firebase Authentication.',
  'auth/email-already-in-use': 'An account already uses this email. Try logging in instead.',
  'auth/invalid-credential': 'That email and password combination could not be verified.',
  'auth/weak-password': 'Choose a stronger password and try again.',
  'auth/user-not-found': 'We could not find an account for that email.',
  'auth/too-many-requests': 'Too many attempts. Wait a little and try again.'
})[error.code] || 'We could not sign you in. Please try again.';

const nextAfterLogin = () => sessionStorage.getItem('redshop-next') || safeNext;
onAuthStateChanged(auth, user => {
  document.querySelectorAll('[data-auth-name]').forEach(el => { el.textContent = user?.displayName || user?.email || ''; });
  if (user && location.pathname.endsWith('/login.html')) location.replace(nextAfterLogin());
});
getRedirectResult(auth).then(result => {
  if (result?.user) location.replace(nextAfterLogin());
}).catch(error => showMessage(friendlyError(error), true));

document.querySelectorAll('[data-google-login]').forEach(button => button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    sessionStorage.setItem('redshop-next', safeNext);
    const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) await signInWithRedirect(auth, provider);
    else { await signInWithPopup(auth, provider); location.assign(nextAfterLogin()); }
  } catch (error) { showMessage(friendlyError(error), true); button.disabled = false; }
}));

document.querySelector('[data-login-form]')?.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try { await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value); location.assign(nextAfterLogin()); }
  catch (error) { showMessage(friendlyError(error), true); button.disabled = false; }
});

document.querySelector('[data-signup-form]')?.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]');
  if (form.password.value !== form.confirm.value) { form.confirm.setCustomValidity('Passwords do not match.'); form.confirm.reportValidity(); return; }
  form.confirm.setCustomValidity(''); button.disabled = true;
  try { const user = (await createUserWithEmailAndPassword(auth, form.email.value.trim(), form.password.value)).user; await updateProfile(user, { displayName: form.name.value.trim() }); location.assign(nextAfterLogin()); }
  catch (error) { showMessage(friendlyError(error), true); button.disabled = false; }
});
document.querySelector('[name="confirm"]')?.addEventListener('input', event => event.currentTarget.setCustomValidity(''));
document.querySelector('[data-forgot-password]')?.addEventListener('click', async event => {
  event.preventDefault(); const email = document.querySelector('[name="email"]')?.value.trim();
  if (!email) return showMessage('Enter your email address first, then choose “Forgot password?”.', true);
  try { await sendPasswordResetEmail(auth, email); showMessage('Password reset email sent. Check your inbox.'); }
  catch (error) { showMessage(friendlyError(error), true); }
});
document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', async () => { await signOut(auth); location.assign('index.html'); }));

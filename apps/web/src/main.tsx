import '@/i18n';
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { lazy, StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { toast } from 'sonner';
import {
  RequireAdmin,
  RequireNonAdmin,
  RequireUser,
} from '@/components/guards';
import { Layout } from '@/components/layout';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/lib/auth';
import { AccountLayout, AccountPage, AddressesPage } from '@/pages/account';
import { LoginPage, RegisterPage } from '@/pages/auth';
import {
  BuyerOrderPage,
  CartPage,
  CheckoutPage,
  OrdersPage,
} from '@/pages/buyer';
import { PaymentPage } from '@/pages/payment';
import { ShopReviews } from '@/components/reviews';
import {
  FlashSalePage,
  HomePage,
  ItemPage,
  SearchPage,
  ShopPage,
} from '@/pages/shop';
import './index.css';

// Admin and seller pages, and the chart library they use, load only when first opened.
function page<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() =>
    load().then((m) => ({ default: m[name] as ComponentType })),
  );
}
const AdminLayout = page(() => import('@/pages/admin'), 'AdminLayout');
const AdminShopPage = page(() => import('@/pages/admin'), 'AdminShopPage');
const AdminShopsPage = page(() => import('@/pages/admin'), 'AdminShopsPage');
const AdminUserPage = page(() => import('@/pages/admin'), 'AdminUserPage');
const AdminUsersPage = page(() => import('@/pages/admin'), 'AdminUsersPage');
const AdminRefundsPage = page(
  () => import('@/pages/admin-money'),
  'AdminRefundsPage',
);
const AdminReturnsPage = page(
  () => import('@/pages/admin-money'),
  'AdminReturnsPage',
);
const AdminLedgerPage = page(
  () => import('@/pages/admin-ledger'),
  'AdminLedgerPage',
);
const AdminVouchersPage = page(
  () => import('@/pages/vouchers'),
  'AdminVouchersPage',
);
const SellerVouchersPage = page(
  () => import('@/pages/vouchers'),
  'SellerVouchersPage',
);
const SellerFlashSalesPage = page(
  () => import('@/pages/flash-sales'),
  'SellerFlashSalesPage',
);
const SellerItemPage = page(
  () => import('@/pages/seller/items'),
  'SellerItemPage',
);
const SellerItemsPage = page(
  () => import('@/pages/seller/items'),
  'SellerItemsPage',
);
const AccountShopPage = page(
  () => import('@/pages/seller/layout'),
  'AccountShopPage',
);
const SellerDashboardPage = page(
  () => import('@/pages/seller/layout'),
  'SellerDashboardPage',
);
const SellerLayout = page(
  () => import('@/pages/seller/layout'),
  'SellerLayout',
);
const SellerShopPage = page(
  () => import('@/pages/seller/layout'),
  'SellerShopPage',
);
const SellerWalletPage = page(
  () => import('@/pages/seller/layout'),
  'SellerWalletPage',
);
const SellerOrderPage = page(
  () => import('@/pages/seller/other'),
  'SellerOrderPage',
);
const SellerOrdersPage = page(
  () => import('@/pages/seller/other'),
  'SellerOrdersPage',
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  mutationCache: new MutationCache({
    onError: (error) => toast.error(error.message),
  }),
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        element: <RequireNonAdmin />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'search', element: <SearchPage /> },
        ],
      },
      { path: 'items/:id', element: <ItemPage /> },
      { path: 'flash-sales/:id', element: <FlashSalePage /> },
      { path: 'shops/:id', element: <ShopPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      {
        element: <RequireUser />,
        children: [
          {
            path: 'account',
            element: <AccountLayout />,
            children: [
              { index: true, element: <AccountPage /> },
              {
                element: <RequireNonAdmin />,
                children: [
                  { path: 'addresses', element: <AddressesPage /> },
                  { path: 'shop', element: <AccountShopPage /> },
                ],
              },
            ],
          },
          {
            element: <RequireNonAdmin />,
            children: [
              { path: 'cart', element: <CartPage /> },
              { path: 'checkout', element: <CheckoutPage /> },
              { path: 'checkouts/:id/payment', element: <PaymentPage /> },
              { path: 'orders', element: <OrdersPage /> },
              { path: 'orders/:id', element: <BuyerOrderPage /> },
              {
                path: 'seller',
                element: <SellerLayout />,
                children: [
                  { index: true, element: <SellerDashboardPage /> },
                  { path: 'profile', element: <SellerShopPage /> },
                  { path: 'wallet', element: <SellerWalletPage /> },
                  { path: 'items', element: <SellerItemsPage /> },
                  { path: 'items/:id', element: <SellerItemPage /> },
                  { path: 'orders', element: <SellerOrdersPage /> },
                  { path: 'orders/:id', element: <SellerOrderPage /> },
                  { path: 'vouchers', element: <SellerVouchersPage /> },
                  { path: 'reviews', element: <ShopReviews /> },
                  {
                    path: 'flash-sales',
                    element: <SellerFlashSalesPage />,
                  },
                ],
              },
            ],
          },
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  { index: true, element: <Navigate to="ledger" replace /> },
                  { path: 'account', element: <AccountPage /> },
                  { path: 'shops', element: <AdminShopsPage /> },
                  { path: 'shops/:id', element: <AdminShopPage /> },
                  { path: 'users', element: <AdminUsersPage /> },
                  { path: 'users/:id', element: <AdminUserPage /> },
                  { path: 'ledger', element: <AdminLedgerPage /> },
                  { path: 'refunds', element: <AdminRefundsPage /> },
                  { path: 'returns', element: <AdminReturnsPage /> },
                  { path: 'vouchers', element: <AdminVouchersPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster richColors />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);

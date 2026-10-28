import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { StrictMode } from 'react';
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
import {
  AdminLayout,
  AdminShopPage,
  AdminShopsPage,
  AdminUserPage,
  AdminUsersPage,
} from '@/pages/admin';
import { AdminRefundsPage, AdminReturnsPage } from '@/pages/admin-money';
import { LoginPage, RegisterPage } from '@/pages/auth';
import {
  BuyerOrderPage,
  CartPage,
  CheckoutPage,
  OrdersPage,
} from '@/pages/buyer';
import { AdminLedgerPage } from '@/pages/admin-ledger';
import { PaymentPage } from '@/pages/payment';
import { AdminVouchersPage, SellerVouchersPage } from '@/pages/vouchers';
import { ShopReviews } from '@/components/reviews';
import { SellerFlashSalesPage } from '@/pages/flash-sales';
import { SellerItemPage, SellerItemsPage } from '@/pages/seller/items';
import {
  AccountShopPage,
  SellerDashboardPage,
  SellerLayout,
  SellerShopPage,
  SellerWalletPage,
} from '@/pages/seller/layout';
import { SellerOrderPage, SellerOrdersPage } from '@/pages/seller/other';
import {
  FlashSalePage,
  HomePage,
  ItemPage,
  SearchPage,
  ShopPage,
} from '@/pages/shop';
import './index.css';

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

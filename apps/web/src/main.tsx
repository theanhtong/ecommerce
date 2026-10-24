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
  AdminLedgerPage,
  AdminShopPage,
  AdminShopsPage,
  AdminUserPage,
  AdminUsersPage,
} from '@/pages/admin';
import { LoginPage, RegisterPage } from '@/pages/auth';
import {
  BuyerOrderPage,
  CartPage,
  CheckoutPage,
  OrdersPage,
} from '@/pages/buyer';
import { PaymentPage } from '@/pages/payment';
import { SellerItemPage, SellerItemsPage } from '@/pages/seller/items';
import { SellerLayout, SellerShopPage } from '@/pages/seller/layout';
import { SellerOrderPage, SellerOrdersPage } from '@/pages/seller/other';
import { HomePage, ItemPage, ShopPage } from '@/pages/shop';
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
        children: [{ index: true, element: <HomePage /> }],
      },
      { path: 'items/:id', element: <ItemPage /> },
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
                  {
                    path: 'seller',
                    element: <SellerLayout />,
                    children: [
                      { index: true, element: <SellerShopPage /> },
                      { path: 'items', element: <SellerItemsPage /> },
                      { path: 'items/:id', element: <SellerItemPage /> },
                      { path: 'orders', element: <SellerOrdersPage /> },
                      { path: 'orders/:id', element: <SellerOrderPage /> },
                    ],
                  },
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

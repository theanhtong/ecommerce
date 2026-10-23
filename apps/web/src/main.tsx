import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { toast } from 'sonner';
import { RequireAdmin, RequireUser } from '@/components/guards';
import { Layout } from '@/components/layout';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/lib/auth';
import { AccountLayout, AccountPage, AddressesPage } from '@/pages/account';
import {
  AdminLayout,
  AdminLedgerPage,
  AdminShopsPage,
  AdminUsersPage,
} from '@/pages/admin';
import { LoginPage, RegisterPage } from '@/pages/auth';
import {
  BuyerOrderPage,
  CartPage,
  CheckoutPage,
  OrdersPage,
} from '@/pages/buyer';
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
      { index: true, element: <HomePage /> },
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
          { path: 'cart', element: <CartPage /> },
          { path: 'checkout', element: <CheckoutPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:id', element: <BuyerOrderPage /> },
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  { path: 'shops', element: <AdminShopsPage /> },
                  { path: 'users', element: <AdminUsersPage /> },
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

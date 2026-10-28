// Resets the dev database and MinIO bucket (keeps admins and regions), then fills a year of
// marketplace activity by calling the API's own services in-process, so every order, stock move,
// voucher use and ledger entry follows the real business rules. Finished orders are then moved
// back in time across the past year; run `pnpm build` first.
import { randomUUID } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { Client } from 'minio';
import pg from 'pg';

process.loadEnvFile('../../.env');

const { NestFactory } = await import('@nestjs/core');
const { plainToInstance } = await import('class-transformer');
const { validate } = await import('class-validator');
const { AppModule } = await import('../dist/app.module.js');
const { PrismaService } = await import('../dist/prisma/prisma.service.js');
const { AuthService } = await import('../dist/modules/auth/auth.service.js');
const { RegisterDto } =
  await import('../dist/modules/auth/dto/register.dto.js');
const { ShopsService } = await import('../dist/modules/shops/shops.service.js');
const { CreateShopDto } =
  await import('../dist/modules/shops/dto/create-shop.dto.js');
const { ItemsService } =
  await import('../dist/modules/catalog/items.service.js');
const { CreateItemDto } =
  await import('../dist/modules/catalog/dto/item.dto.js');
const { ItemImagesService } =
  await import('../dist/modules/catalog/item-images.service.js');
const { AddressesService } =
  await import('../dist/modules/addresses/addresses.service.js');
const { CreateAddressDto } =
  await import('../dist/modules/addresses/dto/address.dto.js');
const { CartService } = await import('../dist/modules/cart/cart.service.js');
const { CheckoutService } =
  await import('../dist/modules/orders/checkout.service.js');
const { CheckoutDto } = await import('../dist/modules/orders/dto/order.dto.js');
const { OrdersService } =
  await import('../dist/modules/orders/orders.service.js');
const { ReturnsService } =
  await import('../dist/modules/orders/returns.service.js');
const { PaymentsService } =
  await import('../dist/modules/payments/payments.service.js');
const { VouchersService } =
  await import('../dist/modules/promotions/vouchers.service.js');
const { CreateVoucherDto, CreatePlatformVoucherDto } =
  await import('../dist/modules/promotions/dto/voucher.dto.js');
const { FlashSalesService } =
  await import('../dist/modules/promotions/flash-sales.service.js');
const { CreateFlashSaleDto } =
  await import('../dist/modules/promotions/dto/flash-sale.dto.js');
const { ReviewsService } =
  await import('../dist/modules/reviews/reviews.service.js');
const { LedgerService } =
  await import('../dist/modules/ledger/ledger.service.js');
const { PayoutsService } =
  await import('../dist/modules/payouts/payouts.service.js');
const { CreatePayoutDto } =
  await import('../dist/modules/payouts/dto/payout.dto.js');
const { RefundsService } =
  await import('../dist/modules/payments/refunds.service.js');

const PASSWORD = 'demo password 123';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const BUYERS = Number(process.env.DEMO_BUYERS ?? 40);
const CHECKOUTS = Number(process.env.DEMO_CHECKOUTS ?? 260);

// Seeded, so every run produces the same marketplace.
let seed = 20261027;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
const chance = (p: number) => random() < p;
const between = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));

// Runs raw input through the same class-transformer and class-validator rules as the HTTP pipe.
async function dto<T extends object>(cls: new () => T, raw: object) {
  const value = plainToInstance(cls, raw);
  const errors = await validate(value, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    throw new Error(
      `${cls.name}: ${JSON.stringify(errors.map((e) => e.constraints ?? e.children))}`,
    );
  }
  return value;
}

type Tier = [name: string, options: string[]];
interface ItemSpec {
  name: string;
  description: string;
  weight: number;
  sku: string;
  tiers: Tier[];
  price: (index: number[]) => number;
  colors: [number, number, number][];
}
interface ShopSpec {
  email: string;
  username: string;
  name: string;
  description: string;
  contactName: string;
  phone: string;
  wardCode: string;
  street: string;
  bank: { bankName: string; accountNumber: string; accountName: string };
  items: ItemSpec[];
}

const SHOPS: ShopSpec[] = [
  {
    email: 'seller@demo.vn',
    username: 'demo_seller',
    name: 'Thời Trang Basic',
    description:
      'Áo thun và quần jean basic, chất liệu cotton dày dặn, form unisex. Đổi size trong 7 ngày.',
    contactName: 'Nguyễn Minh Anh',
    phone: '0901234567',
    wardCode: '26740',
    street: '58 Lê Lợi',
    bank: {
      bankName: 'Vietcombank',
      accountNumber: '0071000123456',
      accountName: 'NGUYEN MINH ANH',
    },
    items: [
      {
        name: 'Áo thun cotton unisex form rộng',
        description:
          'Cotton 100% 250gsm, cổ bo dày không bai, in lụa bền màu. Form rộng unisex, phù hợp cả nam và nữ.',
        weight: 250,
        sku: 'ATU',
        tiers: [
          ['Màu', ['Trắng', 'Đen', 'Be', 'Xanh navy']],
          ['Size', ['S', 'M', 'L', 'XL']],
        ],
        price: ([, size]) => (size === 3 ? 179_000 : 159_000),
        colors: [
          [235, 235, 230],
          [40, 40, 45],
          [214, 196, 168],
          [36, 52, 92],
        ],
      },
      {
        name: 'Quần jean nam ống suông',
        description:
          'Denim cotton co giãn nhẹ, ống suông vừa, wash thủ công. Bảng size theo số đo vòng eo.',
        weight: 600,
        sku: 'QJS',
        tiers: [
          ['Màu', ['Xanh nhạt', 'Xanh đậm']],
          ['Size', ['29', '30', '31', '32', '33']],
        ],
        price: () => 389_000,
        colors: [
          [120, 160, 200],
          [40, 70, 120],
        ],
      },
    ],
  },
  {
    email: 'seller2@demo.vn',
    username: 'demo_seller2',
    name: 'Nhà Gỗ Mộc An',
    description:
      'Đồ gỗ trang trí làm thủ công tại Hội An. Gỗ sấy khô, phủ dầu tự nhiên an toàn.',
    contactName: 'Trần Văn Mộc',
    phone: '0935111222',
    wardCode: '20410',
    street: '21 Trần Phú',
    bank: {
      bankName: 'Techcombank',
      accountNumber: '19033445566',
      accountName: 'TRAN VAN MOC',
    },
    items: [
      {
        name: 'Đèn ngủ gỗ để bàn',
        description:
          'Thân gỗ nguyên khối, chao vải lanh, bóng LED ánh vàng 5W. Dây cắm kèm công tắc.',
        weight: 900,
        sku: 'DNG',
        tiers: [
          ['Gỗ', ['Sồi', 'Óc chó']],
          ['Kiểu', ['Tròn', 'Vuông']],
        ],
        price: ([wood]) => (wood === 1 ? 349_000 : 289_000),
        colors: [
          [196, 160, 110],
          [92, 64, 44],
        ],
      },
      {
        name: 'Kệ sách gỗ 3 tầng',
        description:
          'Gỗ thông ghép, lắp ráp không cần khoan. Chịu tải 15 kg mỗi tầng.',
        weight: 6000,
        sku: 'KSG',
        tiers: [
          ['Kích thước', ['60 cm', '80 cm']],
          ['Màu', ['Tự nhiên', 'Nâu']],
        ],
        price: ([size]) => (size === 1 ? 850_000 : 690_000),
        colors: [
          [210, 180, 140],
          [120, 82, 56],
        ],
      },
    ],
  },
  {
    email: 'gom@demo.vn',
    username: 'gom_battrang',
    name: 'Gốm Sứ Bát Tràng',
    description:
      'Gốm men lam, men rạn nung 1.250°C tại làng Bát Tràng. Đóng gói chống vỡ.',
    contactName: 'Lê Thị Hoa',
    phone: '0912345678',
    wardCode: '00577',
    street: 'Xóm 3, Giang Cao',
    bank: {
      bankName: 'BIDV',
      accountNumber: '21510001234567',
      accountName: 'LE THI HOA',
    },
    items: [
      {
        name: 'Bộ ấm chén men lam vẽ tay',
        description:
          'Ấm 500 ml, chén 60 ml, hoạ tiết sen vẽ tay. Dùng được máy rửa bát.',
        weight: 1800,
        sku: 'AML',
        tiers: [['Bộ', ['6 chén', '10 chén']]],
        price: ([set]) => (set === 1 ? 620_000 : 450_000),
        colors: [
          [60, 100, 170],
          [230, 236, 245],
        ],
      },
      {
        name: 'Bình hoa gốm cổ cao',
        description: 'Bình cắm hoa dáng cổ cao, đáy có đệm nỉ chống trầy.',
        weight: 1200,
        sku: 'BHG',
        tiers: [
          ['Men', ['Lam', 'Rạn', 'Trắng']],
          ['Cỡ', ['Nhỏ', 'Lớn']],
        ],
        price: ([, size]) => (size === 1 ? 320_000 : 180_000),
        colors: [
          [52, 90, 160],
          [200, 190, 160],
          [240, 240, 236],
        ],
      },
    ],
  },
  {
    email: 'caphe@demo.vn',
    username: 'caphe_caudat',
    name: 'Cà Phê Cầu Đất Farm',
    description:
      'Arabica trồng ở độ cao 1.500 m, rang mộc mỗi tuần, giao trong 3 ngày sau rang.',
    contactName: 'Phạm Quốc Huy',
    phone: '0983382233',
    wardCode: '24781',
    street: '9 Hoàng Văn Thụ',
    bank: {
      bankName: 'ACB',
      accountNumber: '12345678',
      accountName: 'PHAM QUOC HUY',
    },
    items: [
      {
        name: 'Cà phê Arabica Cầu Đất rang mộc',
        description:
          'Rang medium, hậu vị ngọt, chua thanh. Túi van một chiều giữ mùi.',
        weight: 300,
        sku: 'CFA',
        tiers: [
          ['Khối lượng', ['250 g', '500 g', '1 kg']],
          ['Kiểu', ['Nguyên hạt', 'Xay pha phin', 'Xay pha máy']],
        ],
        price: ([size]) => [135_000, 255_000, 480_000][size],
        colors: [
          [110, 70, 40],
          [150, 100, 60],
        ],
      },
    ],
  },
  {
    email: 'phukien@demo.vn',
    username: 'phukien_so',
    name: 'Phụ Kiện Số Sài Gòn',
    description:
      'Tai nghe, cáp sạc chính hãng. Bảo hành 12 tháng, 1 đổi 1 trong 30 ngày.',
    contactName: 'Võ Thanh Tùng',
    phone: '0909888777',
    wardCode: '26824',
    street: '120 Võ Văn Ngân',
    bank: {
      bankName: 'MB Bank',
      accountNumber: '0909888777',
      accountName: 'VO THANH TUNG',
    },
    items: [
      {
        name: 'Tai nghe Bluetooth TWS chống ồn',
        description:
          'Bluetooth 5.3, chống ồn chủ động, pin 6 giờ, hộp sạc USB-C. Kèm 3 cỡ nút tai.',
        weight: 200,
        sku: 'TWS',
        tiers: [['Màu', ['Đen', 'Trắng', 'Xanh']]],
        price: () => 459_000,
        colors: [
          [30, 30, 34],
          [236, 236, 240],
          [70, 120, 180],
        ],
      },
      {
        name: 'Cáp sạc nhanh USB-C bọc dù',
        description: 'Sạc nhanh 60W, truyền dữ liệu 480 Mbps, đầu nhôm.',
        weight: 80,
        sku: 'CUC',
        tiers: [
          ['Độ dài', ['1 m', '2 m']],
          ['Màu', ['Đen', 'Trắng']],
        ],
        price: ([length]) => (length === 1 ? 89_000 : 69_000),
        colors: [
          [40, 40, 40],
          [220, 220, 220],
        ],
      },
    ],
  },
  {
    email: 'mypham@demo.vn',
    username: 'mypham_laxanh',
    name: 'Mỹ Phẩm Lá Xanh',
    description:
      'Mỹ phẩm thiên nhiên sản xuất tại Việt Nam, có công bố của Bộ Y tế.',
    contactName: 'Đỗ Thu Trang',
    phone: '0987654321',
    wardCode: '00070',
    street: '15 Hàng Bài',
    bank: {
      bankName: 'VPBank',
      accountNumber: '123456789',
      accountName: 'DO THU TRANG',
    },
    items: [
      {
        name: 'Sữa rửa mặt trà xanh dịu nhẹ',
        description:
          'Chiết xuất trà xanh, pH 5.5, không xà phòng. Phù hợp da dầu và hỗn hợp.',
        weight: 250,
        sku: 'SRM',
        tiers: [['Dung tích', ['100 ml', '200 ml']]],
        price: ([size]) => (size === 1 ? 179_000 : 105_000),
        colors: [
          [140, 190, 120],
          [200, 230, 190],
        ],
      },
      {
        name: 'Kem chống nắng SPF50+ PA++++',
        description:
          'Chống nắng phổ rộng, không bết dính, không để lại vệt trắng. Tuýp 50 ml.',
        weight: 90,
        sku: 'KCN',
        tiers: [['Loại da', ['Da dầu', 'Da khô', 'Da nhạy cảm']]],
        price: () => 265_000,
        colors: [
          [250, 210, 120],
          [250, 235, 200],
        ],
      },
    ],
  },
  {
    email: 'giay@demo.vn',
    username: 'giay_runner',
    name: 'Giày Chạy Bộ Runner',
    description: 'Giày chạy bộ đế êm, đổi size miễn phí trong 15 ngày.',
    contactName: 'Hoàng Đức Long',
    phone: '0977123123',
    wardCode: '00166',
    street: '88 Trần Thái Tông',
    bank: {
      bankName: 'Vietinbank',
      accountNumber: '108877665544',
      accountName: 'HOANG DUC LONG',
    },
    items: [
      {
        name: 'Giày chạy bộ đế êm Air',
        description:
          'Đế EVA đàn hồi, thân lưới thoáng khí, nặng 240 g/chiếc. Size theo chuẩn EU.',
        weight: 800,
        sku: 'GCB',
        tiers: [
          ['Màu', ['Đen', 'Trắng', 'Xám']],
          ['Size', ['38', '39', '40', '41', '42', '43']],
        ],
        price: () => 749_000,
        colors: [
          [35, 35, 40],
          [240, 240, 240],
          [150, 150, 155],
        ],
      },
    ],
  },
  {
    email: 'tra@demo.vn',
    username: 'tra_thainguyen',
    name: 'Trà Thái Nguyên Xanh',
    description: 'Trà móc câu Tân Cương, sao tay, hái theo vụ.',
    contactName: 'Ngô Văn Chè',
    phone: '0388385566',
    wardCode: '01840',
    street: 'Tổ 7, Tân Cương',
    bank: {
      bankName: 'Agribank',
      accountNumber: '8800205123456',
      accountName: 'NGO VAN CHE',
    },
    items: [
      {
        name: 'Trà móc câu Tân Cương',
        description:
          'Búp nhỏ đều, nước xanh, vị chát dịu hậu ngọt. Đóng túi zip hút chân không.',
        weight: 250,
        sku: 'TMC',
        tiers: [['Khối lượng', ['100 g', '200 g', '500 g']]],
        price: ([size]) => [85_000, 160_000, 380_000][size],
        colors: [
          [90, 130, 60],
          [150, 180, 90],
        ],
      },
    ],
  },
  {
    email: 'dochoi@demo.vn',
    username: 'dochoi_bexinh',
    name: 'Đồ Chơi Gỗ Bé Xinh',
    description: 'Đồ chơi gỗ sơn gốc nước, đạt chuẩn an toàn cho bé từ 3 tuổi.',
    contactName: 'Trương Ngọc Mai',
    phone: '0939555444',
    wardCode: '31135',
    street: '32 Hoà Bình',
    bank: {
      bankName: 'Sacombank',
      accountNumber: '070123456789',
      accountName: 'TRUONG NGOC MAI',
    },
    items: [
      {
        name: 'Bộ xếp hình gỗ cho bé',
        description:
          'Mảnh gỗ bo tròn cạnh, in màu gốc nước. Kèm hộp gỗ đựng có nắp trượt.',
        weight: 700,
        sku: 'XHG',
        tiers: [
          ['Số mảnh', ['50 mảnh', '100 mảnh']],
          ['Chủ đề', ['Động vật', 'Xe cộ']],
        ],
        price: ([size]) => (size === 1 ? 259_000 : 179_000),
        colors: [
          [240, 170, 80],
          [100, 170, 220],
        ],
      },
    ],
  },
  {
    email: 'sotay@demo.vn',
    username: 'sotay_handmade',
    name: 'Sổ Tay Handmade',
    description: 'Sổ tay bìa da khâu tay, giấy kraft 100 gsm không lem mực.',
    contactName: 'Bùi Thảo Vy',
    phone: '0905666777',
    wardCode: '20242',
    street: '45 Bạch Đằng',
    bank: {
      bankName: 'TPBank',
      accountNumber: '00012345678',
      accountName: 'BUI THAO VY',
    },
    items: [
      {
        name: 'Sổ tay bìa da khâu tay',
        description:
          'Bìa da PU, gáy khâu chỉ sáp, 200 trang kẻ chấm. Có dây buộc và túi bìa.',
        weight: 350,
        sku: 'STD',
        tiers: [
          ['Màu', ['Nâu', 'Đen', 'Xanh rêu']],
          ['Khổ', ['A5', 'A6']],
        ],
        price: ([, size]) => (size === 1 ? 99_000 : 129_000),
        colors: [
          [130, 85, 50],
          [35, 35, 35],
          [80, 100, 70],
        ],
      },
    ],
  },
];

const PENDING_SHOP = {
  email: 'dolen@demo.vn',
  username: 'dolen_handmade',
  name: 'Đồ Len Handmade',
  description: 'Khăn, mũ len đan tay theo yêu cầu.',
  contactName: 'Mai Thị Len',
  phone: '0915222333',
  wardCode: '19753',
  street: '7 Lê Lợi',
};

const FAMILY = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
  'Lý',
];
const MIDDLE = [
  'Văn',
  'Thị',
  'Minh',
  'Ngọc',
  'Thanh',
  'Đức',
  'Thu',
  'Hoài',
  'Gia',
  'Quốc',
  'Hải',
  'Khánh',
];
const GIVEN = [
  'An',
  'Bình',
  'Châu',
  'Dũng',
  'Giang',
  'Hà',
  'Hiếu',
  'Hùng',
  'Khoa',
  'Lan',
  'Linh',
  'Long',
  'Mai',
  'Nam',
  'Nhung',
  'Phong',
  'Phúc',
  'Quân',
  'Quỳnh',
  'Sơn',
  'Tâm',
  'Thảo',
  'Trang',
  'Trung',
  'Tuấn',
  'Uyên',
  'Vy',
  'Yến',
];
// Wards across the country, both urban wards and rural communes.
const WARDS = [
  '26740',
  '26743',
  '26824',
  '25747',
  '00004',
  '00070',
  '00166',
  '00376',
  '20194',
  '20242',
  '20308',
  '31120',
  '31135',
  '31231',
  '24781',
  '22333',
  '22435',
  '19753',
  '19867',
  '16681',
  '16738',
  '10507',
  '10606',
  '06652',
  '28756',
  '28807',
  '30292',
  '30313',
  '21553',
  '22015',
];
const STREETS = [
  'Lê Lợi',
  'Nguyễn Huệ',
  'Trần Hưng Đạo',
  'Hai Bà Trưng',
  'Lý Thường Kiệt',
  'Phan Chu Trinh',
  'Nguyễn Trãi',
  'Quang Trung',
  'Hùng Vương',
  'Điện Biên Phủ',
];

const COMMENTS: Record<number, string[]> = {
  5: [
    'Hàng đẹp, đúng mô tả, giao nhanh.',
    'Chất lượng tốt so với giá, sẽ ủng hộ tiếp.',
    'Đóng gói cẩn thận, shop tư vấn nhiệt tình.',
    'Rất hài lòng, mua lần thứ hai rồi.',
    '',
  ],
  4: [
    'Hàng ổn, giao hơi chậm một chút.',
    'Đúng mô tả, màu hơi khác ảnh một chút.',
    'Chất lượng tốt, đóng gói có thể kỹ hơn.',
    '',
  ],
  3: ['Tạm được, không như kỳ vọng lắm.', 'Hàng bình thường, giao chậm.'],
  2: ['Sản phẩm có lỗi nhỏ, shop hỗ trợ chậm.', 'Size không chuẩn như bảng.'],
  1: ['Hàng không giống ảnh, thất vọng.'],
};
const REPLIES = [
  'Cảm ơn bạn đã ủng hộ shop!',
  'Shop cảm ơn bạn, hẹn gặp lại ở đơn sau nhé.',
  'Shop xin lỗi vì trải nghiệm chưa tốt, bạn nhắn shop để được hỗ trợ đổi hàng nhé.',
];
const RATINGS = [5, 5, 5, 5, 5, 5, 4, 4, 4, 3, 2, 1];
const CANCEL_REASONS = [
  'changed_mind',
  'found_cheaper',
  'change_address',
  'change_items',
] as const;
const RETURN_REASONS = [
  'damaged',
  'not_as_described',
  'wrong_item',
  'defective',
] as const;

const phoneOf = () => `09${between(10_000_000, 99_999_999)}`;

// A plain PNG: a vertical gradient from one colour to white, so each product image looks different.
function samplePng([r, g, b]: [number, number, number], size = 480) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const pixel = [r, g, b].map((c) => Math.round(c + (255 - c) * t * 0.7));
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) rows.set(pixel, row + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const minioUrl = new URL(process.env.MINIO_ENDPOINT ?? '');
const minio = new Client({
  endPoint: minioUrl.hostname,
  port: Number(minioUrl.port),
  useSSL: minioUrl.protocol === 'https:',
  region: 'us-east-1',
  accessKey: process.env.MINIO_ACCESS_KEY ?? '',
  secretKey: process.env.MINIO_SECRET_KEY ?? '',
});
const bucket = process.env.MINIO_BUCKET ?? '';

async function reset() {
  const { rows } = await db.query<{ wards: number }>(
    'SELECT count(*)::int AS wards FROM wards',
  );
  if (!rows[0].wards)
    throw new Error('No wards loaded; run pnpm db:seed first');
  const admins = await db.query("SELECT 1 FROM users WHERE role = 'admin'");
  if (!admins.rowCount)
    throw new Error('No admin; run pnpm admin:create first');
  await db.query('BEGIN');
  await db.query(
    'TRUNCATE ledger_lines, ledger_entries, ledger_accounts, refunds, bank_transfers, outbox_events, notifications, moderation_actions',
  );
  await db.query('DELETE FROM orders');
  await db.query('DELETE FROM checkouts');
  await db.query('DELETE FROM promotions');
  await db.query('DELETE FROM items');
  await db.query('DELETE FROM shops');
  await db.query("DELETE FROM users WHERE role <> 'admin'");
  await db.query('COMMIT');
  if (await minio.bucketExists(bucket)) {
    const keys: string[] = [];
    for await (const object of minio.listObjectsV2(bucket, '', true)) {
      if (object.name) keys.push(object.name);
    }
    for (let i = 0; i < keys.length; i += 1000) {
      await minio.removeObjects(bucket, keys.slice(i, i + 1000));
    }
  }
}

// Moves one order and everything recorded about it to start at `at`, spacing its steps the way
// a real order spreads over days; its events count as already delivered.
async function moveOrder(orderId: string, at: Date) {
  await db.query(
    `WITH o AS (SELECT id, checkout_id FROM orders WHERE id = $1::uuid),
     h AS (
       UPDATE order_status_history SET created_at = $2::timestamptz + CASE to_status
         WHEN 'to_ship' THEN CASE WHEN from_status = 'unpaid' THEN interval '20 minutes' ELSE interval '0' END
         WHEN 'shipping' THEN interval '1 day'
         WHEN 'delivered' THEN interval '3 days'
         WHEN 'completed' THEN interval '4 days'
         WHEN 'cancelled' THEN interval '5 hours'
         WHEN 'returned' THEN interval '6 days'
         ELSE interval '0' END
       WHERE order_id = $1::uuid RETURNING 1),
     c AS (UPDATE checkouts SET created_at = $2 WHERE id = (SELECT checkout_id FROM o) RETURNING 1),
     p AS (
       UPDATE payments SET created_at = $2, updated_at = $2::timestamptz + interval '20 minutes',
         expires_at = $2::timestamptz + interval '1 day',
         paid_at = CASE WHEN paid_at IS NULL THEN NULL ELSE $2::timestamptz + interval '20 minutes' END
       WHERE checkout_id = (SELECT checkout_id FROM o) RETURNING id),
     b AS (UPDATE bank_transfers SET created_at = $2::timestamptz + interval '20 minutes'
       WHERE payment_id IN (SELECT id FROM p) RETURNING 1),
     lp AS (UPDATE ledger_entries SET created_at = $2::timestamptz + interval '20 minutes'
       WHERE ref_type = 'payment' AND ref_id IN (SELECT id FROM p) RETURNING 1),
     s AS (
       UPDATE shipments SET created_at = $2::timestamptz + interval '12 hours',
         picked_up_at = CASE WHEN picked_up_at IS NULL THEN NULL ELSE $2::timestamptz + interval '1 day' END,
         delivered_at = CASE WHEN delivered_at IS NULL THEN NULL ELSE $2::timestamptz + interval '3 days' END,
         updated_at = $2::timestamptz + interval '3 days'
       WHERE order_id = $1::uuid RETURNING 1),
     r AS (
       UPDATE return_requests SET created_at = $2::timestamptz + interval '4 days',
         decided_at = CASE WHEN decided_at IS NULL THEN NULL ELSE $2::timestamptz + interval '6 days' END
       WHERE order_id = $1::uuid RETURNING 1),
     v AS (
       UPDATE reviews SET created_at = $2::timestamptz + interval '5 days',
         replied_at = CASE WHEN replied_at IS NULL THEN NULL ELSE $2::timestamptz + interval '6 days' END
       WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = $1::uuid) RETURNING 1),
     i AS (
       UPDATE inventory_movements SET created_at = $2::timestamptz + CASE reason
         WHEN 'sale' THEN interval '1 day' WHEN 'release' THEN interval '5 hours'
         WHEN 'return' THEN interval '6 days' ELSE interval '0' END
       WHERE ref_type = 'order' AND ref_id = $1::uuid::text RETURNING 1),
     u AS (UPDATE voucher_usages SET created_at = $2 WHERE checkout_id = (SELECT checkout_id FROM o) RETURNING 1),
     f AS (
       UPDATE refunds SET created_at = $2::timestamptz + CASE
         WHEN (SELECT status FROM orders WHERE id = $1::uuid) = 'returned' THEN interval '6 days'
         ELSE interval '5 hours' END
       WHERE order_id = $1::uuid RETURNING 1)
     UPDATE ledger_entries SET created_at = $2::timestamptz + CASE ref_type
       WHEN 'order' THEN CASE WHEN (SELECT status FROM orders WHERE id = $1::uuid) = 'returned'
         THEN interval '6 days' ELSE interval '4 days' END
       WHEN 'return' THEN interval '6 days'
       ELSE interval '5 hours' END
     WHERE ref_id = $1::uuid AND ref_type IN ('order', 'return', 'refund')`,
    [orderId, at],
  );
  await db.query(
    `UPDATE orders o SET created_at = $2,
       updated_at = (SELECT max(created_at) FROM order_status_history WHERE order_id = o.id)
     WHERE id = $1::uuid`,
    [orderId, at],
  );
  // Old news: mark its events delivered and any notifications already made read.
  await db.query(
    `UPDATE outbox_events SET created_at = $2, published_at = coalesce(published_at, $2)
     WHERE payload->>'orderId' = $1`,
    [orderId, at],
  );
  await db.query(
    `UPDATE notifications SET created_at = $2::timestamptz + interval '1 day',
       read_at = $2::timestamptz + interval '1 day' WHERE order_id = $1`,
    [orderId, at],
  );
}

type Outcome =
  | 'completed'
  | 'cancelled'
  | 'returned'
  | 'unpaid'
  | 'to_ship'
  | 'shipping'
  | 'delivered';

// When an active order was placed, so it sits where it would be today without tripping the
// worker's deadlines.
const ACTIVE_AGE: Partial<Record<Outcome, number>> = {
  unpaid: 3 * HOUR,
  to_ship: 8 * HOUR,
  shipping: 1.5 * DAY,
  delivered: 3.3 * DAY,
};

async function main() {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL;
  if (!adminEmail) throw new Error('Set DEMO_ADMIN_EMAIL in .env');
  await db.connect();

  console.log('Reset dev database and bucket');
  await reset();
  // Only this connection skips triggers: moving the made-up history back in time rewrites ledger
  // timestamps, which the append-only trigger would refuse. Needs a superuser, as in dev.
  await db.query("SET session_replication_role = 'replica'");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const { id: adminId } = await prisma.user.findUniqueOrThrow({
    where: { email: adminEmail },
  });
  const auth = app.get(AuthService);
  const shops = app.get(ShopsService);
  const items = app.get(ItemsService);
  const images = app.get(ItemImagesService);
  const addresses = app.get(AddressesService);
  const carts = app.get(CartService);
  const checkouts = app.get(CheckoutService);
  const orders = app.get(OrdersService);
  const returns = app.get(ReturnsService);
  const payments = app.get(PaymentsService);
  const vouchers = app.get(VouchersService);
  const flashSales = app.get(FlashSalesService);
  const reviews = app.get(ReviewsService);
  const payouts = app.get(PayoutsService);
  const ledger = app.get(LedgerService);
  const refunds = app.get(RefundsService);

  const register = async (email: string, username: string) => {
    await auth.register(
      await dto(RegisterDto, { email, username, password: PASSWORD }),
      {},
    );
    return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  };
  const now = Date.now();
  const yearAgo = new Date(now - 400 * DAY);

  console.log(`Shops: ${SHOPS.length} approved, 1 waiting for review`);
  interface Model {
    id: string;
    price: number;
  }
  const sellers: {
    spec: ShopSpec;
    ownerId: string;
    shopId: string;
    models: Model[];
    voucher: string;
    freeship: boolean;
  }[] = [];
  for (const spec of SHOPS) {
    const ownerId = await register(spec.email, spec.username);
    const shop = await shops.create(
      ownerId,
      await dto(CreateShopDto, {
        name: spec.name,
        description: spec.description,
        contactName: spec.contactName,
        phone: spec.phone,
        wardCode: spec.wardCode,
        street: spec.street,
      }),
    );
    await shops.updateStatus(adminId, shop.id, 'active');
    // Half the shops pay into the Freeship program, so free-shipping codes work on their orders.
    const freeship = sellers.length % 2 === 0;
    if (freeship) {
      await shops.setFreeship(ownerId, true);
      await shops.decideFreeship(shop.id, true);
    }
    const models: Model[] = [];
    for (const item of spec.items) {
      const combos = item.tiers.reduce<number[][]>(
        (acc, [, options]) =>
          acc.flatMap((prefix) => options.map((_, i) => [...prefix, i])),
        [[]],
      );
      const created = await items.create(
        ownerId,
        await dto(CreateItemDto, {
          name: item.name,
          description: item.description,
          weight: item.weight,
          parentSku: item.sku,
          tierVariations: item.tiers.map(([name, options]) => ({
            name,
            options,
          })),
          models: combos.map((index) => ({
            tierIndex: index,
            price: item.price(index),
            stock: between(60, 220),
            sku: `${item.sku}-${index.map((i) => i + 1).join('')}`,
          })),
        }),
      );
      for (const [i, color] of item.colors.entries()) {
        const key = `tmp/${ownerId}/${randomUUID()}.png`;
        await minio.putObject(bucket, key, samplePng(color), undefined, {
          'Content-Type': 'image/png',
        });
        if (i < 9) await images.add(ownerId, created.id, key);
      }
      models.push(
        ...created.models.map((m: { id: string; price: number }) => ({
          id: m.id,
          price: m.price,
        })),
      );
    }
    const code = `${spec.items[0].sku}30K`;
    await vouchers.createForShop(
      ownerId,
      await dto(CreateVoucherDto, {
        code,
        name: `Giảm 30.000đ cho đơn từ 300.000đ`,
        discountKind: 'fixed',
        discountValue: 30_000,
        minSpend: 300_000,
        usageLimit: 200,
        startsAt: yearAgo,
        endsAt: new Date(now + 60 * DAY),
      }),
    );
    sellers.push({
      spec,
      ownerId,
      shopId: shop.id,
      models,
      voucher: code,
      freeship,
    });
    console.log(`  ${spec.name}: ${models.length} SKUs`);
  }
  const pendingOwner = await register(
    PENDING_SHOP.email,
    PENDING_SHOP.username,
  );
  await shops.create(
    pendingOwner,
    await dto(CreateShopDto, {
      name: PENDING_SHOP.name,
      description: PENDING_SHOP.description,
      contactName: PENDING_SHOP.contactName,
      phone: PENDING_SHOP.phone,
      wardCode: PENDING_SHOP.wardCode,
      street: PENDING_SHOP.street,
    }),
  );

  console.log('Platform vouchers');
  const platformVouchers = [
    {
      type: 'platform_voucher',
      code: 'SALE10',
      name: 'Giảm 10% tối đa 10.000đ cho đơn từ 200.000đ',
      discountKind: 'percent',
      discountValue: 10,
      maxDiscount: 10_000,
      minSpend: 200_000,
      usageLimit: 1000,
      startsAt: yearAgo,
      endsAt: new Date(now + 90 * DAY),
    },
    {
      type: 'shipping_voucher',
      code: 'FREESHIP15',
      name: 'Giảm 15.000đ phí vận chuyển cho đơn từ 150.000đ',
      discountKind: 'fixed',
      discountValue: 15_000,
      minSpend: 150_000,
      usageLimit: 2000,
      startsAt: yearAgo,
      endsAt: new Date(now + 90 * DAY),
    },
    {
      type: 'platform_voucher',
      code: 'TET2026',
      name: 'Giảm 50.000đ dịp Tết cho đơn từ 1.000.000đ',
      discountKind: 'fixed',
      discountValue: 50_000,
      minSpend: 1_000_000,
      usageLimit: 300,
      startsAt: yearAgo,
      endsAt: new Date(now - 200 * DAY),
    },
  ];
  for (const v of platformVouchers) {
    await vouchers.createForPlatform(await dto(CreatePlatformVoucherDto, v));
  }

  console.log(`Buyers: ${BUYERS}`);
  const buyers: { id: string; addressIds: string[] }[] = [];
  for (let n = 0; n < BUYERS; n++) {
    const [email, username] =
      n === 0
        ? ['buyer@demo.vn', 'demo_buyer']
        : n === 1
          ? ['buyer2@demo.vn', 'demo_buyer2']
          : [`khach${n}@demo.vn`, `khach_${String(n).padStart(3, '0')}`];
    const id = await register(email, username);
    const name =
      n === 0
        ? 'Nguyễn Văn Demo'
        : n === 1
          ? 'Trần Thị Demo'
          : `${pick(FAMILY)} ${pick(MIDDLE)} ${pick(GIVEN)}`;
    const addressIds: string[] = [];
    for (let a = 0; a < (chance(0.3) ? 2 : 1); a++) {
      const address = await addresses.create(
        id,
        await dto(CreateAddressDto, {
          recipientName: name,
          phone: phoneOf(),
          wardCode: n === 0 && a === 0 ? '26740' : pick(WARDS),
          street: `${between(1, 250)} ${pick(STREETS)}`,
          isDefault: a === 0,
        }),
      );
      addressIds.push(address.id);
    }
    buyers.push({ id, addressIds });
  }

  // A year of checkouts, oldest first so ids follow time; more of them in recent months.
  const plan = Array.from({ length: CHECKOUTS }, () => {
    const age = Math.floor(360 * (1 - Math.sqrt(random()))) + 5;
    return { at: new Date(now - age * DAY - between(0, 20) * HOUR) };
  }).sort((a, b) => a.at.getTime() - b.at.getTime());
  const used = new Set<string>();
  const payoutDays = [300, 240, 180, 120, 60, 20];
  let transferId = 1;
  const counts: Record<string, number> = {};

  const settle = async (
    buyerId: string,
    orderIds: string[],
    outcome: Outcome,
  ) => {
    for (const orderId of orderIds) {
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { shop: true, items: true },
      });
      const seller = order.shop.ownerId;
      counts[outcome] = (counts[outcome] ?? 0) + 1;
      if (outcome === 'unpaid') continue;
      if (outcome === 'cancelled') {
        await orders.cancel(buyerId, orderId, {
          reason: pick(CANCEL_REASONS),
        });
        continue;
      }
      if (outcome === 'to_ship') continue;
      await orders.ship(seller, orderId);
      await orders.updateShipment(seller, orderId, 'picked_up');
      if (outcome === 'shipping') continue;
      await orders.updateShipment(seller, orderId, 'delivered');
      if (outcome === 'delivered') continue;
      if (outcome === 'returned') {
        await returns.request(buyerId, orderId, {
          reason: pick(RETURN_REASONS),
          note: 'Sản phẩm không đúng như mô tả, mong shop hỗ trợ.',
        });
        await returns.sellerAccept(seller, orderId);
        continue;
      }
      await orders.receive(buyerId, orderId);
      for (const line of order.items) {
        if (!chance(0.7)) continue;
        const rating = pick(RATINGS);
        const comment = pick(COMMENTS[rating]);
        const review = await reviews.create(buyerId, line.id, {
          rating,
          ...(comment && { comment }),
        });
        if (chance(rating <= 3 ? 0.8 : 0.3)) {
          await reviews.reply(
            seller,
            review.id,
            rating <= 3 ? REPLIES[2] : pick(REPLIES.slice(0, 2)),
          );
        }
      }
    }
  };

  const place = async (
    buyer: (typeof buyers)[number],
    outcome: Outcome,
    online: boolean,
  ) => {
    // Most carts come from one shop; some mix two.
    const from = [pick(sellers)];
    if (chance(0.15)) from.push(pick(sellers.filter((s) => s !== from[0])));
    for (const seller of from) {
      for (let k = 0; k < (chance(0.25) ? 2 : 1); k++) {
        await carts.add(buyer.id, {
          modelId: pick(seller.models).id,
          quantity: chance(0.8) ? 1 : 2,
        });
      }
    }
    const lines = await prisma.cartItem.findMany({
      where: { userId: buyer.id },
      include: { model: { include: { item: true } } },
    });
    const byShop = new Map<string, number>();
    for (const l of lines) {
      byShop.set(
        l.model.item.shopId,
        (byShop.get(l.model.item.shopId) ?? 0) + l.model.price * l.quantity,
      );
    }
    const total = [...byShop.values()].reduce((a, b) => a + b, 0);
    const codes: string[] = [];
    const tryCode = (code: string, minSpend: number, base: number) => {
      const key = `${buyer.id}:${code}`;
      if (!used.has(key) && base >= minSpend && chance(0.5)) {
        codes.push(code);
        used.add(key);
      }
    };
    for (const seller of from) {
      tryCode(seller.voucher, 300_000, byShop.get(seller.shopId) ?? 0);
    }
    tryCode('SALE10', 200_000, total);
    if (from.some((seller) => seller.freeship)) {
      tryCode('FREESHIP15', 150_000, total);
    }
    const body = {
      cartItemIds: lines.map((l) => l.id),
      addressId: pick(buyer.addressIds),
      paymentMethod: online ? 'online' : 'cod',
    };
    let result;
    try {
      result = await checkouts.checkout(
        buyer.id,
        await dto(CheckoutDto, { ...body, voucherCodes: codes }),
        randomUUID(),
      );
    } catch {
      // A voucher's minimum can fall short after the shop voucher; buy without vouchers then.
      result = await checkouts.checkout(
        buyer.id,
        await dto(CheckoutDto, body),
        randomUUID(),
      );
    }
    const orderIds = result.orders.map((o: { id: string }) => o.id);
    if (online && outcome !== 'unpaid') {
      const payment = await prisma.payment.findUnique({
        where: { checkoutId: result.checkoutId },
      });
      if (payment) {
        await payments.receive({
          id: transferId++,
          transferType: 'in',
          transferAmount: payment.amount,
          content: `${payment.code} chuyen tien`,
          code: payment.code,
          referenceCode: `FT${randomUUID().slice(0, 10).toUpperCase()}`,
        });
      }
    }
    await settle(buyer.id, orderIds, outcome);
    return orderIds as string[];
  };

  // The admin sends buyers their money back a few days after a paid order is cancelled or returned;
  // the last few days' refunds are left waiting.
  const payRefunds = async (orderId: string) => {
    const { rows } = await db.query<{ id: string; at: Date }>(
      `SELECT id, created_at + interval '3 days' AS at FROM refunds
       WHERE order_id = $1::uuid AND status = 'pending'`,
      [orderId],
    );
    for (const { id, at } of rows) {
      if (at.getTime() > now) continue;
      await refunds.pay(id);
      await db.query('UPDATE refunds SET paid_at = $2 WHERE id = $1', [id, at]);
      await db.query(
        'UPDATE ledger_entries SET created_at = $2 WHERE idempotency_key = $1',
        [`refund:${id}:paid`, at],
      );
    }
  };

  // Carriers hand over most of the COD they hold, then shops withdraw.
  const payOut = async (at: Date) => {
    const cod = await prisma.ledgerLine.aggregate({
      where: { account: { type: 'receivable' } },
      _sum: { amount: true },
    });
    const remitted = Math.floor(((cod._sum.amount ?? 0) * 0.95) / 1000) * 1000;
    if (remitted > 0) {
      const key = randomUUID();
      await ledger.remitCod(remitted, key);
      await db.query(
        'UPDATE ledger_entries SET created_at = $2 WHERE idempotency_key = $1',
        [`cod:${key}`, new Date(at.getTime() - DAY)],
      );
    }
    for (const seller of sellers) {
      const balance = await prisma.ledgerLine.aggregate({
        where: { account: { shopId: seller.shopId } },
        _sum: { amount: true },
      });
      const amount =
        Math.floor((-(balance._sum.amount ?? 0) * 0.9) / 10_000) * 10_000;
      if (amount < 100_000) continue;
      const payout = await payouts.request(
        seller.ownerId,
        await dto(CreatePayoutDto, { ...seller.spec.bank, amount }),
      );
      await db.query(
        'UPDATE payouts SET created_at = $2, decided_at = $2 WHERE id = $1',
        [payout.id, at],
      );
      await db.query(
        "UPDATE ledger_entries SET created_at = $2 WHERE ref_type = 'payout' AND ref_id = $1",
        [payout.id, at],
      );
    }
  };

  console.log(`Orders: ${CHECKOUTS} checkouts over the past year`);
  for (const [i, { at }] of plan.entries()) {
    while (payoutDays.length && at.getTime() > now - payoutDays[0] * DAY) {
      await payOut(new Date(now - payoutDays.shift()! * DAY));
    }
    // The demo buyers shop more often than anyone else.
    const buyer = chance(0.12)
      ? buyers[0]
      : chance(0.08)
        ? buyers[1]
        : pick(buyers);
    const roll = random();
    const outcome: Outcome =
      roll < 0.82 ? 'completed' : roll < 0.94 ? 'cancelled' : 'returned';
    for (const orderId of await place(buyer, outcome, chance(0.4))) {
      await moveOrder(orderId, at);
      await payRefunds(orderId);
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${CHECKOUTS}`);
  }
  while (payoutDays.length) {
    await payOut(new Date(now - payoutDays.shift()! * DAY));
  }

  console.log('Orders still in progress');
  const active: [Outcome, number][] = [
    ['unpaid', 4],
    ['to_ship', 10],
    ['shipping', 6],
    ['delivered', 5],
  ];
  for (const [outcome, n] of active) {
    for (let k = 0; k < n; k++) {
      // The demo buyer and the demo seller both get something to act on.
      const buyer = k === 0 ? buyers[0] : pick(buyers.slice(2));
      for (const orderId of await place(buyer, outcome, outcome === 'unpaid')) {
        await moveOrder(
          orderId,
          new Date(now - ACTIVE_AGE[outcome]! - k * HOUR),
        );
        // Recent events are still news: let the worker turn them into notifications.
        await db.query(
          "UPDATE outbox_events SET published_at = NULL WHERE payload->>'orderId' = $1",
          [orderId],
        );
      }
    }
  }

  console.log('Flash sales');
  const [fashion, , , coffee, gadgets] = sellers;
  const flash = await flashSales.create(
    fashion.ownerId,
    await dto(CreateFlashSaleDto, {
      name: 'Flash Sale cuối tuần',
      startsAt: new Date(now),
      endsAt: new Date(now + 10 * HOUR),
      models: fashion.models.slice(0, 4).map((m) => ({
        modelId: m.id,
        price: 99_000,
        quota: 20,
        purchaseLimit: 2,
      })),
    }),
  );
  await flashSales.create(
    coffee.ownerId,
    await dto(CreateFlashSaleDto, {
      name: 'Giờ vàng cà phê',
      startsAt: new Date(now),
      endsAt: new Date(now + 6 * HOUR),
      models: coffee.models.slice(0, 3).map((m) => ({
        modelId: m.id,
        price: Math.round((m.price * 0.7) / 1000) * 1000,
        quota: 15,
        purchaseLimit: 1,
      })),
    }),
  );
  await flashSales.create(
    gadgets.ownerId,
    await dto(CreateFlashSaleDto, {
      name: 'Tai nghe giá sốc ngày mai',
      startsAt: new Date(now + DAY),
      endsAt: new Date(now + DAY + 12 * HOUR),
      models: gadgets.models.slice(0, 3).map((m) => ({
        modelId: m.id,
        price: 299_000,
        quota: 30,
        purchaseLimit: 1,
      })),
    }),
  );
  for (const [k, buyer] of [buyers[1], ...buyers.slice(5, 12)].entries()) {
    const sale = (flash as { models: { id: string }[] }).models[k % 4];
    await checkouts.checkout(
      buyer.id,
      await dto(CheckoutDto, {
        flashSale: { id: sale.id, quantity: k === 0 ? 2 : 1 },
        addressId: buyer.addressIds[0],
        paymentMethod: 'cod',
      }),
      randomUUID(),
    );
  }

  // One shop's request to join Freeship waits for the admin.
  await shops.setFreeship(sellers[1].ownerId, true);

  // Everyone joined before their first order.
  await db.query(
    "UPDATE users SET created_at = $1, updated_at = $1 WHERE role <> 'admin'",
    [yearAgo],
  );
  await db.query('UPDATE shops SET created_at = $1, updated_at = $1', [
    yearAgo,
  ]);
  await db.query('UPDATE items SET created_at = $1, updated_at = $1', [
    yearAgo,
  ]);
  await db.query('UPDATE models SET created_at = $1, updated_at = $1', [
    yearAgo,
  ]);
  await db.query('UPDATE addresses SET created_at = $1, updated_at = $1', [
    yearAgo,
  ]);
  await db.query(
    "UPDATE promotions SET created_at = $1 WHERE type <> 'flash_sale'",
    [yearAgo],
  );
  await db.query(
    "UPDATE inventory_movements SET created_at = $1 WHERE reason = 'restock'",
    [yearAgo],
  );

  await app.close();
  await db.end();
  console.log('\nDone:', counts);
  console.log(`Password for every account: ${PASSWORD}`);
  console.log(
    `  buyer@demo.vn, buyer2@demo.vn, seller@demo.vn (${SHOPS[0].name}), seller2@demo.vn (${SHOPS[1].name})`,
  );
  console.log(
    `  other sellers: ${SHOPS.slice(2)
      .map((s) => s.email)
      .join(', ')}; waiting for review: ${PENDING_SHOP.email}`,
  );
  console.log(`  admin: ${adminEmail}`);
}

await main();

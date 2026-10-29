# Google Maps va Goong Maps

Huong dan cho ban demo ngay 30/10/2026. "Go map" duoc hieu la **Goong Maps**.
Nguoi dieu phoi review khi chua phan cong: Nguyen Ngoc Thanh; van can approval doc lap.

## Vai tro trong ung dung

| Thanh phan | Cach dung hien co | Can khoa |
| --- | --- | --- |
| Goong Geocoding | Tim dia chi, chon goi y, khach kiem tra toa do va xac nhan truoc khi luu | REST API key o backend |
| Goong Distance Matrix | Uoc tinh duong bo giua cac ca; vehicle=car | REST API key o backend |
| Google Maps URLs | Nut chi duong trong don cua khach va ca sitter da nhan | Khong |
| Google Routes API | Nguon tinh tuyen thay the, DRIVE va TRAFFIC_UNAWARE | Server API key, Routes API va billing |
| Ban do nhung/keo ghim | Chua tich hop SDK ban do nhung trong dot nay | Can browser key/Maptiles key rieng va kiem tra tren trinh duyet |

Goong va Google la hai nha cung cap doc lap. Moi lan trien khai chon **mot** nguon tinh tuyen;
khong gui hai request tinh phi cho cung mot phep tinh va khong tu chuyen provider khi gap loi.
Google Maps URLs mo ung dung/trang chi duong rieng, khong nap Google Places hay Google map tiles
vao ban do Goong. Du lieu Goong chi hien thi trong danh sach goi y co attribution Goong.

## 1. Tao khoa Goong

1. Mo <https://account.goong.io/>, tao tai khoan/du an va vao muc quan ly API keys.
2. Tao **REST API key** cho Geocoding va Distance Matrix. Maptiles key dung cho hien thi ban do
   la khoa khac; khong thay no vao GOONG_REST_API_KEY.
3. Chon goi/quota phu hop trong tai khoan. Kiem tra cach gioi han key theo IP/quyen ma tai khoan
   hien tai ho tro; khong dua khoa REST vao frontend. Khong gui key vao chat, issue hay PR.
4. Dat khoa trong backend/.env local hoac secret store cua server. File nay khong duoc Git theo doi.

```dotenv
MAPS_ENABLED=true
MAPS_ROUTING_PROVIDER=goong
GOONG_REST_API_KEY=<REST_KEY_RIENG_CUA_DU_AN>
GOOGLE_MAPS_SERVER_KEY=
```

Backend goi host co dinh rsapi.goong.io, GET /Geocode va /DistanceMatrix, redirect bi chan.
GeoJSON luu [longitude,latitude]; request Goong dung latitude,longitude. Khong dao hai gia tri.

## 2. Google Maps va Routes API

Nut "Chi duong bang Google Maps" da dung URL chinh thuc
https://www.google.com/maps/dir/?api=1&destination=... . Cach nay khong can Google API key
va chi gui dia chi sang Google khi nguoi dung bam link. Chi sitter da nhan ca duoc doc dia chi
ca cua minh; danh sach loi moi chua nhan chi co khu vuc va thong tin cham soc.

Neu muon Google tinh thoi gian di chuyen thay Goong:

1. Mo <https://console.cloud.google.com/>, tao/chon project va lien ket billing.
2. Bat **Routes API**. Adapter dung computeRouteMatrix moi, khong can bat Distance Matrix API legacy.
3. Tao API key cho backend; API restriction chi cho Routes API, application restriction theo IP
   egress co dinh cua backend. May local IP thay doi can khoa dev rieng va quota thap.
4. Dat quota cho Routes API va canh bao ngan sach. Budget alert khong tu dong chan chi phi.
5. Cau hinh backend va khoi dong lai:

```dotenv
MAPS_ROUTING_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=<SERVER_KEY_RIENG_CUA_DU_AN>
```

GOONG_REST_API_KEY van can neu tiep tuc dung tim dia chi Goong. MAPS_ENABLED dieu khien endpoint
tim dia chi; MAPS_ROUTING_PROVIDER dieu khien tinh tuyen rieng. Khong dung server key trong VITE_*.
Neu bo sung Google Maps JavaScript/Embed ve sau, tao browser key rieng, gioi han HTTP referrer
va chi bat cac API frontend can dung; khong tai su dung server key.

## 3. Cau hinh booking va ca lam

```dotenv
AUTH_ENABLED=true
BOOKING_CHECKOUT_ENABLED=true
EMPLOYEE_SCHEDULING_ENABLED=true
EMPLOYEE_DISPATCH_AGENT_ENABLED=true
BOOKING_WEB_ORIGIN=http://127.0.0.1:5188
BOOKING_FACILITY_ADDRESS=So 5 pho Tran Cao Van, Hai Ba Trung, Ha Noi
BOOKING_FACILITY_COORDINATES=
AI_ROUTING_BOUNDS=
```

Dien BOOKING_FACILITY_COORDINATES bang mang JSON [longitude,latitude] sau khi kiem tra dung
ghim so 5 Tran Cao Van. Khong tu dung toa do trung tam Ha Noi. Khi thieu toa do co so, ca tai
co so van co the xep noi bo cung dia diem, nhung tuyen co so <-> nha khach can Staff ra soat.
AI_ROUTING_BOUNDS chi dien khi da xac dinh rectangle west,south,east,north; khong dung rectangle
de thay cho danh muc khu vuc nghiep vu hay ranh gioi hanh chinh.

Provision storage tren database demo rieng theo migration employee-scheduling-storage va finance
truoc khi bat cac flag; runtime khong tu tao indexes. Contract, nang luc da duyet, khu vuc/ca
sitters va payment provider la cac cau hinh doc lap. MAPS_* khong kich hoat thanh toan that.

Luong: dia chi duoc xac nhan -> quote -> booking snapshot -> prepay neu nhieu buoi/nhieu ngay
-> xac minh thu du trong han 15 phut -> Staff xac nhan care plan -> agent gui loi moi -> sitter
chap nhan sau khi kiem tra lai. Khach chi dinh sitter thi giu nguyen sitter; doi gio can khach
xac nhan. Ca luu tru toi da 8 gio; ban do khong thay doi gia, combo hay hoa hong.

## 4. Gioi han va cach kiem tra

- Tim dia chi: dang nhap + CSRF, toi da 10 request/tai khoan/phut tren moi app instance;
  toi da 5 goi y. Goi y khong tu tao dia chi/booking.
- Matrix thuong mai: toi da 10 diem/100 elements/request, deadline toi da 8 giay, body 1 MB.
  Hai chieu duong di duoc tinh rieng. Hien dung oto, khong khang dinh ETA xe may hay live traffic.
- Raw matrix Google/Goong khong duoc ghi cache Mongo. OSRM giu cache 15 phut voi namespace rieng.
  Xem dieu khoan provider truoc khi mo rong luu tru, hien thi hay tai su dung du lieu.
- Loi/quota/timeout/mat khoa -> khong co ETA da xac minh; ca can kiem tra di chuyen duoc giu
  cho Staff, khong tu thay bang khoang cach duong chim hoac ETA bang 0.
- Test tu dong hien dung fake provider, khong goi API tinh phi. Can smoke test voi khoa that:
  dia chi dung/sai, ZERO_RESULTS, tuyen hai chieu, loi quota/key, ca co du/thieu thoi gian di chuyen,
  va chap nhan loi moi khi lich vua bi thay doi. Khong chup key vao anh bang chung.
- Chua co ban do nhung, keo ghim, theo doi GPS truc tiep, traffic-aware hay toi uu nhieu xe.

## Nguon da doi chieu

- [Goong SDK chinh thuc: Geocode](https://github.com/goong-io/goong-sdk/blob/master/services/geocoding.js)
- [Goong SDK chinh thuc: Distance Matrix](https://github.com/goong-io/goong-sdk/blob/master/services/distancematrix.js)
- [Google: computeRouteMatrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/guide)
- [Google Routes policies va attribution](https://developers.google.com/maps/documentation/routes/policies)
- [Google API security](https://developers.google.com/maps/api-security-best-practices)

Truy cap 30/10/2026: Google docs va Goong SDK GitHub doc duoc. docs.goong.io gap
ERR_TLS_CERT_ALTNAME_INVALID tu may hien tai; khong tat kiem tra TLS de vuot loi.
Contract Goong da doi chieu SDK nhung chua xac minh response voi key cua du an.

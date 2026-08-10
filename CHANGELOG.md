# [1.2.0](https://github.com/andrew-snape/homebridge-cgd-garage-door/compare/v1.1.0...v1.2.0) (2026-08-10)


### Features

* add a momentary Stop button for the garage door ([003e6dc](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/003e6dcf0c3db55cb186b6d4d18d650deb446dc6))

# [1.1.0](https://github.com/andrew-snape/homebridge-cgd-garage-door/compare/v1.0.1...v1.1.0) (2026-08-10)


### Features

* surface real device identity and error state in HomeKit ([7fee787](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/7fee787b2ba4811de403d1da5ee31bdabdedb3b6))

## [1.0.1](https://github.com/andrew-snape/homebridge-cgd-garage-door/compare/v1.0.0...v1.0.1) (2026-08-08)


### Bug Fixes

* rename npm package scope to match the actual npm account ([360d35d](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/360d35d04f46c9532988de9060938d6371dabedf))

# 1.0.0 (2026-08-07)


### Bug Fixes

* homebridge verification request ([c298258](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/c2982585c5beed40bbbc11363d49698c9ab6beb5))
* Improve status refreshing logic ([dc782ef](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/dc782ef54aa7e2fb9f4b6c0460a543587e50637a))
* stop bind event handler in configureAccessory and add missing config check ([#2](https://github.com/andrew-snape/homebridge-cgd-garage-door/issues/2)) ([d6ffaf7](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/d6ffaf7a1687fbe23c6150d41fdf50ce815939ea))
* update node version requirement to >=18.0.0 ([b385857](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/b385857b7d3c10817c49649da9824e0f3627f5d6))
* update node version to 18.0.0 ([db17281](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/db17281c289e21c9740b6f2e260c9487fbf09b03))


### Features

* add accessory information ([8c8a31d](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/8c8a31df215dec4d2b161c177333bedc275e1e8f))
* add door switch into existing integration ([345c24f](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/345c24f0d17667cddce589b4ee547104cddb6d63))
* Add keep-alive agent for HTTP requests ([b6f21f4](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/b6f21f432e3c0ccf2c83720f81cc39ea4564064e))
* add light switch into existing integration ([2cf55e3](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/2cf55e32c0fd0c756c69681f5956d0915063c911))
* Add retry logic for failed API requests ([3af071e](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/3af071e38e01e5d615681828333be0a996c69d5b))
* homebridge verified ([5ee5ce0](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/5ee5ce032ca1764e7fcf3b31f818d3e7dc58017f))
* Improve garage door status pooling logic ([5040af1](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/5040af1e6ff18de4594e0c450dbdd4ec88cb9184))
* integrate with cgd api to stream video into hb ([7d2b761](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/7d2b7610d2c17130e88253c3a58bfd733c50bf94))
* introduce runQ to avoid switch flakiness when off and on are set together and conflict with retryUntil ([#4](https://github.com/andrew-snape/homebridge-cgd-garage-door/issues/4)) ([73787c5](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/73787c5a140fa24c8645beaa48fa9c8bf8eee601))
* progressive update value ([87bf84d](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/87bf84d255c637a5097cd8568d9d9beec19417f3))
* retry until reach the expected state ([7a17877](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/7a17877a24ca69fd598ba653564c63503e7e9f11))
* runQ release ([4cdb364](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/4cdb3644e60d955d32800891c2fa54f1b07c0176))
* support Homebridge 2.0 and Node 20+ ([b62ad44](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/b62ad448802a4528e0ca9a9f5f0d13a48d461c13))
* update door state logic ([f33edc9](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/f33edc984b0f7e3a950f1d211cf9791df795883e))
* Update garage door status pooling logic ([c1a2fc1](https://github.com/andrew-snape/homebridge-cgd-garage-door/commit/c1a2fc13a2f856d098da09398b3f1931c0657921))

# [1.8.0](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.7.0...v1.8.0) (2024-09-22)


### Features

* homebridge verified ([5ee5ce0](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/5ee5ce032ca1764e7fcf3b31f818d3e7dc58017f))

# [1.7.0](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.6.1...v1.7.0) (2024-08-12)


### Features

* introduce runQ to avoid switch flakiness when off and on are set together and conflict with retryUntil ([#4](https://github.com/KieraDOG/homebridge-cgd-garage-door/issues/4)) ([73787c5](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/73787c5a140fa24c8645beaa48fa9c8bf8eee601))
* runQ release ([4cdb364](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/4cdb3644e60d955d32800891c2fa54f1b07c0176))

# [1.7.0-beta.5](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.7.0-beta.4...v1.7.0-beta.5) (2024-08-12)


### Bug Fixes

* fix fn has been called twice ([43d8af6](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/43d8af6cabcc7a972012e12da2bed9c622eace55))

# [1.7.0-beta.4](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.7.0-beta.3...v1.7.0-beta.4) (2024-08-12)


### Bug Fixes

* only filter the rest of the q when the q has more than one items ([526c3a0](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/526c3a0fbb3816be5ac3b72c58b6e2578ba6c394))

# [1.7.0-beta.3](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.7.0-beta.2...v1.7.0-beta.3) (2024-08-12)


### Bug Fixes

* not filter the 1st item from the runQ as it is still processing ([9180bc0](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/9180bc0aa59558b0fdcbbc3b6098e02cd1fba426))

# [1.7.0-beta.2](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.7.0-beta.1...v1.7.0-beta.2) (2024-08-12)


### Bug Fixes

* only remove the item from the if it is done ([1751cab](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/1751cab4663707258f698473d4c4b0f013eda628))

# [1.7.0-beta.1](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.6.1...v1.7.0-beta.1) (2024-08-12)


### Features

* Add queue system for command execution ([57cafd0](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/57cafd0766b07725eb96fdf936dc8cb1e7722a08))

## [1.6.1](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.6.0...v1.6.1) (2024-08-12)


### Bug Fixes

* Improve status refreshing logic ([dc782ef](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/dc782ef54aa7e2fb9f4b6c0460a543587e50637a))

# [1.6.0](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.5.0...v1.6.0) (2024-08-12)


### Features

* retry until reach the expected state ([7a17877](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/7a17877a24ca69fd598ba653564c63503e7e9f11))

# [1.5.0](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.4.0...v1.5.0) (2024-08-09)


### Features

* Add keep-alive agent for HTTP requests ([b6f21f4](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/b6f21f432e3c0ccf2c83720f81cc39ea4564064e))

# [1.4.0](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.3.0...v1.4.0) (2024-08-08)


### Features

* progressive update value ([87bf84d](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/87bf84d255c637a5097cd8568d9d9beec19417f3))

# [1.3.0](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.2.0...v1.3.0) (2024-08-01)


### Features

* Improve garage door status pooling logic ([5040af1](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/5040af1e6ff18de4594e0c450dbdd4ec88cb9184))

# [1.2.0](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.1.3...v1.2.0) (2024-08-01)


### Features

* Update garage door status pooling logic ([c1a2fc1](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/c1a2fc13a2f856d098da09398b3f1931c0657921))

## [1.1.3](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.1.2...v1.1.3) (2024-08-01)


### Bug Fixes

* update node version requirement to >=18.0.0 ([b385857](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/b385857b7d3c10817c49649da9824e0f3627f5d6))

## [1.1.2](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.1.1...v1.1.2) (2024-08-01)


### Bug Fixes

* update node version to 18.0.0 ([db17281](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/db17281c289e21c9740b6f2e260c9487fbf09b03))

## [1.1.1](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.1.0...v1.1.1) (2024-08-01)


### Bug Fixes

* homebridge verification request ([c298258](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/c2982585c5beed40bbbc11363d49698c9ab6beb5))

# [1.1.0](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.0.1...v1.1.0) (2024-08-01)


### Features

* Add retry logic for failed API requests ([3af071e](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/3af071e38e01e5d615681828333be0a996c69d5b))

## [1.0.1](https://github.com/KieraDOG/homebridge-cgd-garage-door/compare/v1.0.0...v1.0.1) (2024-08-01)


### Bug Fixes

* stop bind event handler in configureAccessory and add missing config check ([#2](https://github.com/KieraDOG/homebridge-cgd-garage-door/issues/2)) ([d6ffaf7](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/d6ffaf7a1687fbe23c6150d41fdf50ce815939ea))

# 1.0.0 (2024-07-31)


### Features

* add accessory information ([8c8a31d](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/8c8a31df215dec4d2b161c177333bedc275e1e8f))
* add door switch into existing integration ([345c24f](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/345c24f0d17667cddce589b4ee547104cddb6d63))
* add light switch into existing integration ([2cf55e3](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/2cf55e32c0fd0c756c69681f5956d0915063c911))
* integrate with cgd api to stream video into hb ([7d2b761](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/7d2b7610d2c17130e88253c3a58bfd733c50bf94))
* update door state logic ([f33edc9](https://github.com/KieraDOG/homebridge-cgd-garage-door/commit/f33edc984b0f7e3a950f1d211cf9791df795883e))
